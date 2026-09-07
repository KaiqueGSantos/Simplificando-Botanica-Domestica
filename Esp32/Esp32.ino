#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <time.h>

const char* WIFI_NOME = "NOME";
const char* WIFI_SENHA = "SENHA";
const char* API_URL = "http://IP:3000/leituras";

const int TIPO_PLANTA = 1;

DHT dht(4, DHT22);

void setup() {
  Serial.begin(115200);
  dht.begin();

  analogReadResolution(12);
  analogSetPinAttenuation(34, ADC_11db);
  analogSetPinAttenuation(35, ADC_11db);

  WiFi.begin(WIFI_NOME, WIFI_SENHA);

  Serial.print("Conectando");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWi-Fi conectado!");

  // Sincroniza o relogio pela internet, em UTC.
  configTime(0, 0, "pool.ntp.org", "time.google.com");

  delay(2000);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Sem Wi-Fi.");
    WiFi.reconnect();
    delay(5000);
    return;
  }

  struct tm horario;

  if (!getLocalTime(&horario, 5000)) {
    Serial.println("Aguardando sincronizacao do horario.");
    delay(2000);
    return;
  }

  char horarioLeitura[25];
  strftime(
    horarioLeitura,
    sizeof(horarioLeitura),
    "%Y-%m-%dT%H:%M:%SZ",
    &horario
  );

  float temperatura = dht.readTemperature();
  float umidadeAr = dht.readHumidity();
  int ldr = analogRead(34);
  int umidadeSolo = analogRead(35);

  if (isnan(temperatura) || isnan(umidadeAr)) {
    Serial.println("Falha no DHT22. Este envio foi ignorado.");
    delay(10000);
    return;
  }

  String json = "{";
  json += "\"tipo_planta\":" + String(TIPO_PLANTA) + ",";
  json += "\"horario_leitura\":\"" + String(horarioLeitura) + "\",";
  json += "\"temperatura\":" + String(temperatura, 1) + ",";
  json += "\"umidade_ar\":" + String(umidadeAr, 1) + ",";
  json += "\"ldr\":" + String(ldr) + ",";
  json += "\"umidade_solo\":" + String(umidadeSolo);
  json += "}";

  WiFiClient cliente;
  HTTPClient http;

  http.begin(cliente, API_URL);
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");

  Serial.print("Sinal Wi-Fi: ");
  Serial.print(WiFi.RSSI());
  Serial.println(" dBm");

  int resposta = http.POST(json);

  Serial.println(json);
  Serial.print("HTTP: ");
  Serial.println(resposta);

  http.end();

  delay(30000);
}