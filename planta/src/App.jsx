import {
  Leaf,
  Thermometer,
  Droplets,
  Sun,
  Sprout,
  CalendarDays,
  MapPin,
  Activity,
  BarChart3
} from "lucide-react";

import plantaFeliz from "./assets/planta feliz.png";
import plantaTriste from "./assets/planta triste.png";

import "./App.css";

const sensors = [
  {
    title: "TEMPERATURA",
    nota: "temperatura",
    value: "24,8 °C",
    icon: Thermometer,
    color: "teal",
    bars: [35, 45, 30, 50, 55, 75, 65, 72, 80]
  },
  {
    title: "UMIDADE DO AR",
     nota: "umidadeAr",
    value: "62%",
    icon: Droplets,
    color: "teal",
    bars: [30, 42, 50, 65, 70, 70, 68, 60, 45]
  },
  {
    title: "LUZ (LDR)",
    nota: "luz",
    value: "3000",
    icon: Sun,
    color: "lime",
    bars: [30, 48, 60, 75, 55, 50, 40, 35, 25]
  },
  {
    title: "UMIDADE DO SOLO",
    nota: "umidadeSolo",
    value: "2318",
    icon: Droplets,
    color: "teal",
    bars: [40, 50, 65, 80, 70, 62, 48, 42, 35]
  }
];

const notasIndividuais = {
  luz:8,
  umidadeAr:7,
  umidadeSolo:7,
  temperatura:7
}

const statusPlanta = "SAUDÁVEL"
const notaGeral = 7.8
const especies = [
  {
    id: 1,
    nome: "Jiboia",
    nomeCientifico: "Epipremnum aureum"
  },
  {
    id: 2,
    nome: "Espada-de-São-Jorge",
    nomeCientifico: "Dracaena trifasciata"
  },
  {
    id: 3,
    nome: "Samambaia",
    nomeCientifico: "Nephrolepis exaltata"
  },
  {
    id: 4,
    nome: "Zamioculca",
    nomeCientifico: "Zamioculcas zamiifolia"
  },
  {
    id: 5,
    nome: "Costela-de-Adão",
    nomeCientifico: "Monstera deliciosa"
  }
];


function SensorCard({ sensor }) {
  const Icon = sensor.icon;
  const nota = notasIndividuais[sensor.nota];
  const corNota = nota > 5 ? "nota-verde" : "nota-vermelha";

  return (
    <div className={`sensor-card ${sensor.color}`}>

      <div className="sensor-header">
        <Icon size={45} strokeWidth={2} />

        <span className={corNota}>
          {sensor.title}
        </span>
      </div>

      <div className="sensor-value">
        {sensor.value}
      </div>

      <div className="sensor-bottom">

        <div className="bars">
          {sensor.bars.map((height, index) => (
            <div
              key={index}
              className="bar"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>

        <Activity size={24} />

      </div>

    </div>
  );
}

function CurrentData() {
  return (
    <section className="current-data">

      <div className="section-title">
        <div className="title-icon">
          <Sprout />
        </div>

        <h2>DADOS ATUAIS</h2>

        <div className="title-line" />

        <span className="slashes">////</span>
      </div>

      <div className="sensor-grid">

        {sensors.map((sensor) => (
          <SensorCard
            key={sensor.title}
            sensor={sensor}
          />
        ))}

      </div>

    </section>
  );
}

function PlantCard() {
  return (
    <section className="plant-card">

      <div className="plant-title">
        <span>SUA PLANTA</span>
      </div>

      <div className="plant-image">
        <img
          src={notaGeral < 5 ? plantaTriste : plantaFeliz}
          alt="Estado atual da planta"
          className="plant-illustration"
        />
      </div>

      <div className="healthy">
        <Leaf size={25} />
        {statusPlanta} | NOTA: {notaGeral}
      </div>

    </section>
  );
}

function PlantInfo() {
  return (
    <section className="plant-info">

      <div className="info-header">
        <Leaf />
        <span>INFORMAÇÕES DA PLANTA</span>
      </div>

      <div className="info-content">

        {/* ESPÉCIE */}

        <div className="info-row">
          <Leaf />

          <strong>ESPÉCIE</strong>

        <select defaultValue={especies[0].id}>
          {especies.map((especie) => (
            <option key={especie.id} value={especie.id}>
              {especie.nome} ({especie.nomeCientifico})
            </option>
          ))}
        </select>
        </div>


        {/* LOCAL */}

        <div className="info-row">

          <MapPin />

          <strong>LOCAL</strong>

          <input
            type="text"
            defaultValue="Sala de Estudo"
            placeholder="Digite o local..."
          />

        </div>


        {/* IDADE */}

        <div className="info-row">

          <Sprout />

          <strong>IDADE</strong>

          <select defaultValue="3">
            <option value="1">
              1 mês
            </option>

            <option value="2">
              2 meses
            </option>

            <option value="3">
              3 meses
            </option>

            <option value="4">
              4 meses
            </option>

            <option value="5">
              5 meses
            </option>

            <option value="6">
              6 meses
            </option>

            <option value="12">
              1 ano
            </option>

            <option value="24">
              2 anos
            </option>

            <option value="36">
              3 anos ou mais
            </option>
          </select>

        </div>

      </div>


      <div className="plant-message">

        <p>
          Plantas conectam pessoas
          <br />
          a um futuro mais verde.
        </p>

      </div>

    </section>
  );
}

function Calendar() {

  const today = new Date();

  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // Nome do mês atual
  const monthName = new Intl.DateTimeFormat("pt-BR", {
    month: "long"
  }).format(today);

  // Primeira letra maiúscula
  const formattedMonth =
    monthName.charAt(0).toUpperCase() + monthName.slice(1);

  // Quantidade de dias do mês atual
  const daysInMonth = new Date(
    currentYear,
    currentMonth + 1,
    0
  ).getDate();

  // Dia da semana em que o mês começa
  // 0 = domingo
  // 1 = segunda...
  const firstDay = new Date(
    currentYear,
    currentMonth,
    1
  ).getDay();

  // Cria os espaços antes do primeiro dia
  const emptyDays = Array.from({
    length: firstDay
  });

  // Cria os dias do mês
  const days = Array.from(
    { length: daysInMonth },
    (_, index) => index + 1
  );

  // Notas de exemplo
  const performance = {
    1: 7.5,
    2: 8.2,
    3: 6.8,
    4: 9.1,
    5: 8.7,
    6: 7.9,
    7: 8.5,
    8: 9.3,
    9: 8.8,
    10: 7.2,
    11: 4.2
  };

  return (
    <section className="calendar">

      <div className="section-title">

        <div className="title-icon">
          <CalendarDays />
        </div>

        <h2>CALENDÁRIO</h2>

        <div className="title-line" />

      </div>


      {/* MÊS ATUAL */}

      <div className="month">

        <strong>
          {formattedMonth} {currentYear}
        </strong>

      </div>


      {/* DIAS DA SEMANA */}

      <div className="weekdays">

        <span>DOM</span>
        <span>SEG</span>
        <span>TER</span>
        <span>QUA</span>
        <span>QUI</span>
        <span>SEX</span>
        <span>SÁB</span>

      </div>


      {/* DIAS */}

      <div className="days">

        {/* Espaços antes do primeiro dia */}
        {emptyDays.map((_, index) => (
          <div
            key={`empty-${index}`}
            className="day empty"
          />
        ))}


        {days.map((day) => {

          const score = performance[day];

          const isToday =
            day === today.getDate();

          return (

            <div
              key={day}
              className={`day ${isToday ? "selected" : ""}`}
            >

              <span>
                {day}
              </span>


              {/* Só mostra tooltip se existir uma nota */}

              {score !== undefined && (

                <div className="day-tooltip">

                  <strong>
                    {day} de {formattedMonth}
                  </strong>

                  <div
                    className={`score ${
                      score < 5 ? "low-score" : ""
                    }`}
                  >
                    🌱 {score}/10
                  </div>

                  <small>
                    Desempenho da planta
                  </small>

                </div>

              )}

            </div>

          );

        })}

      </div>

    </section>
  );
}

function ReadingsChart() {
 const values = [
  [8.5, 7.2, 6.5, 8.0],
  [8.2, 7.8, 6.8, 7.5],
  [9.0, 8.1, 7.2, 8.5],
  [8.7, 7.5, 6.9, 9.0],
  [9.2, 8.0, 7.5, 8.7]
 
];

  return (
    <section className="readings">

      <div className="readings-header">

        <div className="section-title">

          <div className="title-icon">
            <BarChart3 />
          </div>

          <h2>LEITURAS RECENTES</h2>

          <div className="title-line" />

          <span className="slashes">////</span>

        </div>

      </div>

      <div className="chart">

       <div className="y-axis">
        <span>10</span>
        <span>8</span>
        <span>6</span>
        <span>4</span>
        <span>2</span>
        <span>0</span>
      </div>

        <div className="chart-area">

          <div className="grid-lines">
            {[0, 1, 2, 3, 4].map((line) => (
              <div key={line} />
            ))}
          </div>

          <div className="chart-bars">

            {values.map((group, index) => (

              <div className="bar-group" key={index}>

                {group.map((value, i) => (

                  <div
                    key={i}
                    className={`chart-bar bar-${i}`}
                   style={{
                    height: `${value * 10}%`
                  }}
                  />

                ))}

              </div>

            ))}

          </div>

          <div className="x-axis">

            {[
              "1º leitura",
              "2º leitura",
              "3º leitura",
              "4º leitura",
              "5º leitura"
            ].map((hour) => (
              <span key={hour}>{hour}</span>
            ))}

          </div>

        </div>

      </div>

      <div className="legend">

        <span>
          <i className="legend-temperature" />
          Temperatura (°C)
        </span>

        <span>
          <i className="legend-air" />
          Umidade do ar (%)
        </span>

        <span>
          <i className="legend-light" />
          Luz (LDR)
        </span>

        <span>
          <i className="legend-soil" />
          Umidade do solo
        </span>

      </div>

    </section>
  );
}

export default function App() {
  return (
    <div className="dashboard">
      <main className="main-content">
        <div className="top-grid">
          <PlantCard />
          <CurrentData />
          <PlantInfo />
        </div>

        <div className="bottom-grid">
          <Calendar />
          <ReadingsChart />
        </div>
      </main>
    </div>
  );
}