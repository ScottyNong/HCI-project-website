let data, usa;
const selectedData = { drug: "Alcohol", ageGroup: "12-17", year: "2002" };
let clickedState = null;
let hoveredState = null;
let minRate, maxRate;
const stateShapes = new Map();
const dataCache = new Map();
let mapBuffer;
let hoverProgress = 0;

function preload() {
  data = loadTable('drugs.csv', 'csv', 'header', 
    () => console.log('Data loaded successfully'),
    (error) => console.error('Error loading data:', error)
  );
  usa = loadJSON('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json',
    () => console.log('USA map data loaded successfully'),
    (error) => console.error('Error loading USA map data:', error)
  );
}

function setup() {
  pixelDensity(1);
  const canvas = createCanvas(1000, 600);
  canvas.parent('canvas-container');
  mapBuffer = createGraphics(width, height);
  
  createUI();
  createStateShapes();
  calculateRateRange();
  updateMapColors();
}

function draw() {
  background(240);
  image(mapBuffer, 0, 0);
  if (hoveredState) highlightState(hoveredState, color(100, 100, 255, 100));
  if (clickedState) highlightState(clickedState, color(100, 100, 255, 200));
  drawLegend();
  
  if (clickedState) {
    displayStateInfo(clickedState);
  }
}

function createStateShapes() {
  usa.features.forEach(feature => {
    const state = feature.properties.name;
    const shapes = [];
    if (feature.geometry.type === "Polygon") {
      shapes.push(processCoordinates(feature.geometry.coordinates[0]));
    } else if (feature.geometry.type === "MultiPolygon") {
      feature.geometry.coordinates.forEach(polygon => {
        shapes.push(processCoordinates(polygon[0]));
      });
    }
    stateShapes.set(state, shapes);
  });
}

function processCoordinates(coordinates) {
  return coordinates.map(coord => latLongToXY(coord[1], coord[0]));
}

function latLongToXY(lat, long) {
  const x = map(long, -125, -66, width * 0.05, width * 0.95);
  const y = map(lat, 49, 25, height * 0.05, height * 0.95);
  return {x, y};
}

function createUI() {
  const formContainer = select('#form-container');
  
  const drugs = ["Alcohol", "Tobacco", "Cocaine", "Marijuana"];
  const ageGroups = ["12-17", "18-25", "26+"];
  const years = [...new Set(data.getColumn('Year'))].sort();

  createStyledSelect("Select Drug:", drugs, formContainer, value => updateSelection('drug', value));
  createStyledSelect("Select Age Group:", ageGroups, formContainer, value => updateSelection('ageGroup', value));
  createStyledSelect("Select Year:", years, formContainer, value => updateSelection('year', value));
}

function createStyledSelect(label, options, parent, callback) {
  const formGroup = createDiv().parent(parent).class('form-group');
  createElement('label', label).parent(formGroup);
  const selectBox = createSelect().parent(formGroup);
  options.forEach(option => selectBox.option(option));
  selectBox.changed(() => callback(selectBox.value()));
}

function updateSelection(type, value) {
  selectedData[type] = value;
  calculateRateRange();
  updateMapColors();
}

function calculateRateRange() {
  const rates = [];
  stateShapes.forEach((_, state) => {
    const rate = getConsumptionData(state);
    if (rate !== null) rates.push(rate);
  });
  minRate = Math.min(...rates);
  maxRate = Math.max(...rates);
}

function updateMapColors() {
  mapBuffer.clear();
  mapBuffer.noStroke();
  stateShapes.forEach((shapes, state) => {
    const consumption = getConsumptionData(state);
    const colorValue = getColorFromConsumption(consumption);
    mapBuffer.fill(colorValue);
    shapes.forEach(shape => {
      mapBuffer.beginShape();
      shape.forEach(pos => mapBuffer.vertex(pos.x, pos.y));
      mapBuffer.endShape(CLOSE);
    });
  });
  mapBuffer.stroke(0);
  mapBuffer.strokeWeight(1);
  mapBuffer.noFill();
  stateShapes.forEach(shapes => {
    shapes.forEach(shape => {
      mapBuffer.beginShape();
      shape.forEach(pos => mapBuffer.vertex(pos.x, pos.y));
      mapBuffer.endShape(CLOSE);
    });
  });
}

function getConsumptionData(state) {
  const key = `${state}_${selectedData.year}_${selectedData.drug}_${selectedData.ageGroup}`;
  if (!dataCache.has(key)) {
    const row = data.rows.find(r => r.getString('State') === state && r.getString('Year') === selectedData.year);
    if (row) {
      let column;
      if (selectedData.drug === "Cocaine") {
        column = `Rates.Illicit Drugs.Cocaine Used Past Year.${selectedData.ageGroup}`;
      } else if (selectedData.drug === "Marijuana") {
        column = `Rates.Marijuana.Used Past Month.${selectedData.ageGroup}`;
      } else {
        column = `Rates.${selectedData.drug}.Use Past Month.${selectedData.ageGroup}`;
      }
      dataCache.set(key, row.getNum(column) || null);
    } else {
      dataCache.set(key, null);
    }
  }
  return dataCache.get(key);
}

function getColorFromConsumption(consumption) {
  if (consumption === null) return color(200);
  const normalizedRate = map(consumption, minRate, maxRate, 0, 1);
  return lerpColor(color(255, 255, 0), color(255, 0, 0), normalizedRate);
}

function drawLegend() {
  const legendX = width - 150;
  const legendY = height - 120;
  const legendWidth = 20;
  const legendHeight = 100;

  noStroke();
  for (let i = 0; i < legendHeight; i++) {
    const t = i / legendHeight;
    fill(lerpColor(color(255, 255, 0), color(255, 0, 0), t));
    rect(legendX, legendY + i, legendWidth, 1);
  }
  
  fill(200);
  rect(legendX, legendY + legendHeight + 5, legendWidth, 20);

  fill(0);
  textAlign(LEFT, CENTER);
  textSize(12);
  text('High', legendX + 30, legendY);
  text('Low', legendX + 30, legendY + legendHeight);
  text('No data', legendX + 30, legendY + legendHeight + 15);

  textSize(14);
  textAlign(CENTER);
  text('Consumption', legendX + legendWidth / 2, legendY - 20);
}

function mouseMoved() {
  const newHoveredState = getStateAtPoint(mouseX, mouseY);
  
  // Si l'état survolé change, on réinitialise l'animation
  if (newHoveredState !== hoveredState) {
    hoveredState = newHoveredState;
    hoverProgress = 0; // Commence la transition
  } else if (hoveredState) {
    hoverProgress = min(hoverProgress + 0.05, 1); // Transition douce
  }
  redraw();
}

function mousePressed() {
  clickedState = getStateAtPoint(mouseX, mouseY);
  redraw();
}
function mouseOut() {
  hoverProgress = max(hoverProgress - 0.05, 0); // Réduire la progression
  redraw();
}
function getStateAtPoint(x, y) {
  for (const [state, shapes] of stateShapes) {
    if (shapes.some(shape => isPointInPolygon(x, y, shape))) {
      return state;
    }
  }
  return null;
}

function isPointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function highlightState(state, highlightColor) {
  const shapes = stateShapes.get(state);
  if (shapes) {
    noStroke();
    fill(lerpColor(highlightColor, color(0, 0, 255, 150), hoverProgress)); // Transition de couleur douce
    shapes.forEach(shape => {
      beginShape();
      shape.forEach(pos => {
        const scaleFactor = lerp(1, 1.1, hoverProgress); // Effet de zoom
        vertex(pos.x * scaleFactor, pos.y * scaleFactor);
      });
      endShape(CLOSE);
    });
  }
}

function displayStateInfo(state) {
  const consumption = getConsumptionData(state);
  const row = data.rows.find(r => r.getString('State') === state && r.getString('Year') === selectedData.year);
  
  fill(0);
  textSize(14);
  textAlign(CENTER);
  
  if (consumption !== null && row) {
    const population = row.getNum(`Population.${selectedData.ageGroup}`);
    let total;
    if (selectedData.drug === "Cocaine") {
      total = row.getNum(`Totals.Illicit Drugs.Cocaine Used Past Year.${selectedData.ageGroup}`);
    } else if (selectedData.drug === "Marijuana") {
      total = row.getNum(`Totals.Marijuana.Used Past Month.${selectedData.ageGroup}`);
    } else {
      total = row.getNum(`Totals.${selectedData.drug}.Use Past Month.${selectedData.ageGroup}`);
    }
    text(`${state}: ${selectedData.drug} use (${selectedData.ageGroup}) in ${selectedData.year}`, width / 2, height - 40);
    text(`Rate: ${consumption.toFixed(2)}%, Total: ${total}, Population: ${population}`, width / 2, height - 20);
  } else {
    text("No data available for this selection", width / 2, height - 30);
  }
}
