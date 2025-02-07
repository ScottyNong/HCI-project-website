let data, usa;
let selectedDrug = "Alcohol";
let selectedAgeGroup = "12-17";
let selectedYear = "2002";
let clickedState = null;
let minRate, maxRate;
let stateShapes = {};
let dataCache = {};
let mapBuffer;

function preload() {
  data = loadTable('drugs.csv', 'csv', 'header');
  usa = loadJSON('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json');
}

function setup() {
  pixelDensity(1);
  let canvas = createCanvas(1000, 600);
  canvas.parent('canvas-container');
  mapBuffer = createGraphics(width, height);
  
  createUI();
  createStateShapes();
  calculateRateRange();
}

function draw() {
  background(240);
  drawMap();
  drawLegend();
  
  if (clickedState) {
    displayStateInfo(clickedState);
  }
}

function createStateShapes() {
  for (let feature of usa.features) {
    let state = feature.properties.name;
    stateShapes[state] = [];
    for (let coord of feature.geometry.coordinates[0]) {
      let pos = latLongToXY(coord[1], coord[0]);
      stateShapes[state].push(pos);
    }
  }
}

function createUI() {
  let formContainer = select('#form-container');
  
  let drugs = ["Alcohol", "Tobacco", "Cocaine", "Marijuana"];
  let ageGroups = ["12-17", "18-25", "26+"];
  let years = [...new Set(data.getColumn('Year'))].sort();

  createStyledSelect("Select Drug:", drugs, formContainer, (value) => {
    selectedDrug = value;
    calculateRateRange();
    redraw();
  });
  
  createStyledSelect("Select Age Group:", ageGroups, formContainer, (value) => {
    selectedAgeGroup = value;
    calculateRateRange();
    redraw();
  });
  
  createStyledSelect("Select Year:", years, formContainer, (value) => {
    selectedYear = value;
    calculateRateRange();
    redraw();
  });
}

function createStyledSelect(label, options, parent, callback) {
  let formGroup = createDiv();
  formGroup.parent(parent);
  formGroup.class('form-group');

  let labelElement = createElement('label', label);
  labelElement.parent(formGroup);

  let selectBox = createSelect();
  selectBox.parent(formGroup);

  options.forEach(option => selectBox.option(option));
  selectBox.changed(() => callback(selectBox.value()));
}

function calculateRateRange() {
  let rates = data.rows.filter(row => row.getString('Year') === selectedYear)
    .map(row => getConsumptionData(row.getString('State')))
    .filter(rate => rate !== null);
  minRate = min(rates);
  maxRate = max(rates);
}

function drawMap() {
  mapBuffer.clear();
  mapBuffer.push();
  for (let state in stateShapes) {
    let consumption = getConsumptionData(state);
    let colorValue = getColorFromConsumption(consumption);
    mapBuffer.fill(colorValue);
    mapBuffer.stroke(0);
    mapBuffer.strokeWeight(1);
    mapBuffer.beginShape();
    for (let pos of stateShapes[state]) {
      mapBuffer.vertex(pos.x, pos.y);
    }
    mapBuffer.endShape(CLOSE);
  }
  mapBuffer.pop();
  image(mapBuffer, 0, 0);
}

function latLongToXY(lat, long) {
  let x = map(long, -125, -66, width * 0.05, width * 0.95);
  let y = map(lat, 49, 25, height * 0.05, height * 0.95);
  return createVector(x, y);
}

function getConsumptionData(state) {
  let key = `${state}_${selectedYear}_${selectedDrug}_${selectedAgeGroup}`;
  if (dataCache[key] === undefined) {
    let row = data.rows.find(r => r.getString('State') === state && r.getString('Year') === selectedYear);
    if (row) {
      let column;
      if (selectedDrug === "Cocaine") {
        column = `Rates.Illicit Drugs.Cocaine Used Past Year.${selectedAgeGroup}`;
      } else if (selectedDrug === "Marijuana") {
        column = `Rates.Marijuana.Used Past Month.${selectedAgeGroup}`;
      } else {
        column = `Rates.${selectedDrug}.Use Past Month.${selectedAgeGroup}`;
      }
      dataCache[key] = row.getNum(column);
    } else {
      dataCache[key] = null;
    }
  }
  return dataCache[key];
}

function getColorFromConsumption(consumption) {
  if (consumption === null) return color(200);
  let normalizedRate = map(consumption, minRate, maxRate, 0, 1);
  
  if (normalizedRate > 0.66) {
    return color(255, 0, 0);
  } else if (normalizedRate > 0.33) {
    return color(255, 165, 0);
  } else {
    return color(255, 255, 0);
  }
}

function drawLegend() {
  const legendX = width - 150;
  const legendY = height - 120;
  const legendWidth = 20;
  const legendHeight = 100;

  const colors = [color(255, 0, 0), color(255, 165, 0), color(255, 255, 0), color(200)];
  const labels = ['High', 'Medium', 'Low', 'No data'];

  for (let i = 0; i < colors.length; i++) {
    fill(colors[i]);
    rect(legendX, legendY + i * 25, legendWidth, 20);
    fill(0);
    textAlign(LEFT, CENTER);
    textSize(12);
    text(labels[i], legendX + 30, legendY + i * 25 + 10);
  }

  textSize(14);
  textAlign(CENTER);
  text('Consumption', legendX + legendWidth / 2, legendY - 20);
}

function mousePressed() {
  clickedState = null;
  for (let state in stateShapes) {
    if (isPointInPolygon(mouseX, mouseY, stateShapes[state])) {
      clickedState = state;
      break;
    }
  }
  redraw();
}

function isPointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    let xi = polygon[i].x, yi = polygon[i].y;
    let xj = polygon[j].x, yj = polygon[j].y;
    let intersect = ((yi > y) != (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function displayStateInfo(state) {
  let consumption = getConsumptionData(state);
  let row = data.rows.find(r => r.getString('State') === state && r.getString('Year') === selectedYear);
  if (consumption !== null && row) {
    let population = row.getNum(`Population.${selectedAgeGroup}`);
    let total;
    if (selectedDrug === "Cocaine") {
      total = row.getNum(`Totals.Illicit Drugs.Cocaine Used Past Year.${selectedAgeGroup}`);
    } else if (selectedDrug === "Marijuana") {
      total = row.getNum(`Totals.Marijuana.Used Past Month.${selectedAgeGroup}`);
    } else {
      total = row.getNum(`Totals.${selectedDrug}.Use Past Month.${selectedAgeGroup}`);
    }
    fill(0);
    textSize(14);
    textAlign(CENTER);
    text(`${state}: ${selectedDrug} use (${selectedAgeGroup}) in ${selectedYear}`, width / 2, height - 40);
    text(`Rate: ${consumption.toFixed(2)}%, Total: ${total}, Population: ${population}`, width / 2, height - 20);
  } else {
    fill(0);
    textSize(14);
    textAlign(CENTER);
    text("No data available for this selection", width / 2, height - 30);
  }
}
