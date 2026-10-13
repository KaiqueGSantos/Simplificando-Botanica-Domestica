/*
 * Botânica doméstica — versão 1.3.0
 * Tudo neste arquivo: configuração, sensores, Wi-Fi e envio à API.
 * Preencha NOME, SENHA e IP antes de gravar no ESP32.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <time.h>
#include <math.h>
#include <string.h>
#include "ConversoesSensores.h"

// Configuração da montagem atual (ESP32 clássico + DHT22).
const char* WIFI_NOME = "Jailson";
const char* WIFI_SENHA = "j48s40b18k13r05";
const char* API_URL = "http://192.168.0.162:3000/leituras";

const int ID_CONTROLADOR = 1;  // ID lógico cadastrado para este ESP na API.
const int TIPO_PLANTA = 1;
const int PINO_DHT = 4;
const int PINO_LDR = 34;
const int PINO_SOLO = 35;

// Preencha com a calibração da montagem. Sem calibração, envia null.
const int SOLO_ADC_SECO = -1;
const int SOLO_ADC_UMIDO = -1;
const float LDR_ALIMENTACAO_MV = NAN;
const float LDR_RESISTOR_OHMS = NAN;
const float LDR_RESISTENCIA_10_LUX_OHMS = NAN;
const float LDR_GAMMA = NAN;
const LigacaoLdr LDR_LIGACAO = LDR_NAO_CONFIGURADO;

const unsigned long INTERVALO_LEITURA = 30000;  // 30 segundos.
const unsigned long INTERVALO_WIFI = 5000;    // 15 segundos.
const unsigned long PRIMEIRA_LEITURA = 5000;   // Aguarda o DHT estabilizar.

DHT dht(PINO_DHT, DHT22);

unsigned long ultimaLeitura = 0;
unsigned long ultimaTentativaWifi = 0;
bool primeiraLeitura = true;
bool wifiEstavaConectado = false;
bool configurado = false;

void iniciarWifi() {
  ultimaTentativaWifi = millis();
  WiFi.begin(WIFI_NOME, WIFI_SENHA);
  Serial.println("[Wi-Fi] Tentando conectar...");
}

void verificarWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!wifiEstavaConectado) {
      wifiEstavaConectado = true;
      Serial.printf("[Wi-Fi] Conectado. IP: %s | RSSI: %ld dBm\n",
                    WiFi.localIP().toString().c_str(), (long)WiFi.RSSI());
      // Sincroniza em segundo plano; o horário enviado será UTC.
      configTime(0, 0, "pool.ntp.org", "time.google.com");
    }
    return;
  }

  if (wifiEstavaConectado) {
    wifiEstavaConectado = false;
    ultimaTentativaWifi = millis();
    Serial.println("[Wi-Fi] Conexão perdida.");
  }

  // A subtração sem sinal funciona também quando millis() volta a zero.
  if (millis() - ultimaTentativaWifi >= INTERVALO_WIFI) {
    WiFi.disconnect(false, false);
    iniciarWifi();
  }
}

void fazerLeitura() {
  float temperatura = dht.readTemperature();
  float umidadeAr = dht.readHumidity();
  int ldr = analogRead(PINO_LDR);
  int umidadeSolo = analogRead(PINO_SOLO);

  bool temperaturaValida = isfinite(temperatura) && temperatura >= -40 && temperatura <= 80;
  bool umidadeArValida = isfinite(umidadeAr) && umidadeAr >= 0 && umidadeAr <= 100;
  bool ldrValido = ldr >= 0 && ldr <= 4095;
  bool umidadeSoloValida = umidadeSolo >= 0 && umidadeSolo <= 4095;

  float umidadeSoloPercentual = converterSoloParaPercentual(
      umidadeSolo, SOLO_ADC_SECO, SOLO_ADC_UMIDO);
  // Usa tensão calibrada do ADC; saturação não permite estimar lux.
  float luminosidadeLux = ldr > 0 && ldr < 4095
      ? converterLdrParaLux(analogReadMilliVolts(PINO_LDR), LDR_ALIMENTACAO_MV,
                           LDR_RESISTOR_OHMS, LDR_RESISTENCIA_10_LUX_OHMS,
                           LDR_GAMMA, LDR_LIGACAO)
      : NAN;

  if (!temperaturaValida || !umidadeArValida || !ldrValido || !umidadeSoloValida) {
    Serial.println("[Sensor] Medição inválida será enviada como null.");
  }

  Serial.printf("[Leitura] %.1f °C | ar: %.1f %% | LDR: %d | solo: %d\n",
                temperatura, umidadeAr, ldr, umidadeSolo);
  Serial.printf("[Conversão] luminosidade: %.2f lux | solo: %.1f %%\n",
                luminosidadeLux, umidadeSoloPercentual);

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Envio] Sem Wi-Fi. Esta leitura foi descartada.");
    return;
  }

  // Não envia uma data próxima de 1970 antes de obter a hora por NTP.
  time_t agora = time(nullptr);
  if (agora < 1704067200) {  // 01/01/2024 UTC.
    Serial.println("[Envio] Aguardando sincronização do horário.");
    return;
  }

  struct tm horario;
  gmtime_r(&agora, &horario);
  char horarioLeitura[25];
  strftime(horarioLeitura, sizeof(horarioLeitura), "%Y-%m-%dT%H:%M:%SZ", &horario);

  // Medições são números JSON, sem aspas ou unidades; falhas são null.
  // Mantém os nomes originais: ldr em lux e umidade_solo em porcentagem.
  String json = "{\"id_controlador\":" + String(ID_CONTROLADOR);
  json += ",\"tipo_planta\":" + String(TIPO_PLANTA);
  json += ",\"horario_leitura\":\"" + String(horarioLeitura) + "\"";
  json += ",\"temperatura\":" + (temperaturaValida ? String(temperatura, 1) : String("null"));
  json += ",\"umidade_ar\":" + (umidadeArValida ? String(umidadeAr, 1) : String("null"));
  json += ",\"ldr\":" + (isfinite(luminosidadeLux) ? String(luminosidadeLux, 2) : String("null"));
  json += ",\"umidade_solo\":" + (isfinite(umidadeSoloPercentual) ? String(umidadeSoloPercentual, 1) : String("null")) + "}";

  WiFiClient cliente;
  HTTPClient http;
  http.setConnectTimeout(4000);
  http.setTimeout(5000);

  if (!http.begin(cliente, API_URL)) {
    Serial.println("[HTTP] Não foi possível iniciar a conexão com a API.");
    http.end();
    return;
  }

  http.addHeader("Content-Type", "application/json");
  Serial.println(json);
  Serial.printf("[Wi-Fi] RSSI: %ld dBm\n", (long)WiFi.RSSI());

  int resposta = http.POST(json);
  Serial.printf("[HTTP] %d\n", resposta);
  if (resposta < 0) {
    Serial.println(HTTPClient::errorToString(resposta));
  } else if (resposta != 201) {
    Serial.println("[HTTP] Resposta diferente do 201 esperado pela API.");
  }
  http.end();
  // Se falhar, a próxima tentativa será uma nova leitura, sem reenviar esta.
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n[Início] Botânica ESP32 v1.3.0");

  if (strcmp(WIFI_NOME, "NOME") == 0 || strcmp(WIFI_SENHA, "SENHA") == 0 ||
      strcmp(API_URL, "http://IP:3000/leituras") == 0 ||
      strncmp(API_URL, "http://", 7) != 0) {
    Serial.println("[Config] Preencha NOME, SENHA e o IP da API no início do arquivo.");
    return;
  }

  dht.begin();
  analogReadResolution(12);  // ADC bruto de 0 a 4095.
  analogSetPinAttenuation(PINO_LDR, ADC_11db);
  analogSetPinAttenuation(PINO_SOLO, ADC_11db);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false);  // Uma estratégia de reconexão: verificarWifi().
  iniciarWifi();
  ultimaLeitura = millis();
  configurado = true;
}

void loop() {
  if (!configurado) {
    delay(100);
    return;
  }

  verificarWifi();
  unsigned long intervalo = primeiraLeitura ? PRIMEIRA_LEITURA : INTERVALO_LEITURA;

  if (millis() - ultimaLeitura >= intervalo) {
    ultimaLeitura = millis();
    primeiraLeitura = false;
    fazerLeitura();
  }
  delay(10);  // Cede tempo ao ESP32 sem bloquear o intervalo de 30 segundos.
}
