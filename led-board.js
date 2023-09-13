"use strict";
// Constant definitions
const SETTINGS = {
  "prefix" : "https://api.golemio.cz/v2/pid/departureboards/?", // Base URL
  "httpTimeout" : 20,
  "offlineText" : "<p>Omlouváme se, zařízení je dočasně mimo provoz</p><p>Aktuální odjezdy spojů naleznete na webu pid.cz/odjezdy</p>",
  "dayOfWeek" : ["Neděle","Pondělí","Úterý","Středa","Čtvrtek","Pátek","Sobota"] // Dictionary of week days
}

// Settings that can be changed
let settings = {
  "offline" : 0,
  "lastConnectionTime" : undefined
}

// Default settings of URL parameters
const PARAMETERS = {
  "airCondition" : true,
  "aswIds" : "539_1",
  "filter" : "routeHeadingOnce",
  "limit" : 5,
  "skip" : "atStop",
  "minutesAfter" : 99
}

// Make a copy of parameters which can be edited
let parameters = PARAMETERS;

// Lock it so no unauthorized values cannot be added
Object.seal(parameters);

// Get URL parameters
let searchString = new URLSearchParams(document.location.search);
for (const [key, value] of searchString){
  parameters[key] = value;
}

// Assure that user input is correct, if not, replace with default values
if (!["true","false"].includes(parameters.airCondition)) parameters.airCondition = PARAMETERS.airCondition;
if (!/^[1-9][0-9]{0,4}(_\d{1,3})?$/.test(parameters.aswIds)) parameters.aswIds = PARAMETERS.aswIds;
if (!["none", "routeOnce", "routeHeadingOnce", "routeOnceFill", "routeHeadingOnceFill", "routeHeadingOnceNoGap", "routeHeadingOnceNoGapFill"].includes(parameters.filter)) parameters.filter = PARAMETERS.filter;
if (parameters.limit <= 0 && parameters.limit >= 8) parameters.limit = PARAMETERS.limit;

// Copy the desired number of rows to CSS
document.documentElement.style.setProperty('--displayed-rows', parameters.limit);
document.getElementsByTagName("body")[0].classList.add("fontsize" + parameters.limit);

// Construct query string
const queryString = new URLSearchParams(parameters).toString();

// Fill table with content for the first time
getData(queryString);
updateClock();

function getData(queryString) {
  try {
    const httpRequest = new XMLHttpRequest();
    httpRequest.timeout = SETTINGS.httpTimeout * 1000; // should be miliseconds by spec
    httpRequest.open("GET", SETTINGS.prefix + queryString);
    httpRequest.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
    httpRequest.setRequestHeader('x-access-token', KEY);
    httpRequest.onreadystatechange = function () {
      // ReadyState 4 = done, HTTP 200 = OK
      if (this.readyState === 4) {
        // Continue on success (200) or process errors
        switch (httpRequest.status) {
          case 200:
            // Reset counter when connection successful and remove offline message
            settings.offline = 0;
            // TODO Get absolute time of connection acquistion to know data age
            // TODO settings.lastConnectionTime = data.currentTime;
            // TODO $("#offline").removeAttr("style");
            const data = JSON.parse(this.responseText);

        // If data succesfully arrived, replace the local time (which could be incorrect) with server time
            // TODO data.currentTime = luxon.DateTime.fromHTTP(httpRequest.getResponseHeader("date")).setLocale("cs").setZone(SETTINGS.preferredTimeZone);
        updateContent(data);
            break;
          case 400:
            fullScreenMessage("Chybný dotaz.<br>Nechybí ID zastávky?");
            break;
          case 401:
            fullScreenMessage("Problém s API klíčem<br>Nesprávný nebo chybějící API klíč. Pro získání API klíče se zaregistrujte u Golemia.");
            break;
          case 404:
            fullScreenMessage("Zastávka je nyní bez provozu");
            break;
          case 0:
            fullScreenMessage(SETTINGS.offlineText);
            break;
          default:
        fullScreenMessage(SETTINGS.offlineText);
            console.error("Chyba načítání stránky. HTTP " + httpRequest.status + " " + httpRequest.statusText);
      }
      }
    }
    httpRequest.send();
  }
  catch(e){
    fullScreenMessage();
  }
}

// Create rows with departures and insert them into document
function updateContent(data){
  

  // If multiple stops are to be displayed, show column with platform numbers
  const uniqueStops = new Set();
  data.stops.forEach((stop) => {
    uniqueStops.add(stop.asw_id.node+"/"+stop.asw_id.stop);
  });
  settings.showPlatformNumbers = (uniqueStops.size > 1) ? true : false;

  const body = document.getElementsByTagName("main")[0];
  body.replaceChildren();
  data.departures.forEach((row) => {
    const departure = document.createElement("div");

    const route = document.createElement("div");
    route.classList.add("route");
    route.textContent = row.route.short_name;
    body.appendChild(route);

    const accessible = document.createElement("div");
    accessible.classList.add("accessible");
    if (row.trip.is_wheelchair_accessible) {
      const wheelchair = document.createElement("img");
      wheelchair.setAttribute("src","accessible.svg");
      accessible.appendChild(wheelchair);
    }
    body.appendChild(accessible);

    const airCondition = document.createElement("div");
    airCondition.classList.add("aircondition");
    if (row.trip.is_air_conditioned) {
      const aircondition = document.createElement("img");
      aircondition.setAttribute("src","snowflake.svg");
      airCondition.appendChild(aircondition);
    }
    body.appendChild(airCondition);

    const headsign = document.createElement("div");
    headsign.classList.add("headsign");
    headsign.textContent = row.trip.headsign;
    body.appendChild(headsign);

    if (settings.showPlatformNumbers) {
      const platform = document.createElement("div");
      platform.classList.add("platform");
      platform.textContent = row.stop.platform_code;
      body.appendChild(platform);
    }

    const arrival = document.createElement("div");
    arrival.classList.add("arrival");
    arrival.textContent = row.departure_timestamp.minutes;
    body.appendChild(arrival);
  });
}

function updateClock(){
  const now = new Date();
  const date = SETTINGS.dayOfWeek[now.getDay()] +
  " " +
  now.getDate().toString().padStart(2,"0") +
  ".&thinsp;" +
  now.getMonth().toString().padStart(2,"0") +
  ".&thinsp;" +
  now.getFullYear().toString().padStart(2,"0");
  const hours = now.getHours().toString().padStart(2,"0");
  const minutes = now.getMinutes().toString().padStart(2,"0");
  document.getElementById("date").innerHTML = date;
  document.getElementById("hours").textContent = hours;
  document.getElementById("minutes").textContent = minutes;
}

// Set fullscreen information text
function fullScreenMessage(content = ""){
  const main = document.getElementsByTagName("main")[0];
  const message = document.getElementById("fullscreen-text").content.cloneNode(true);
  message.firstChild.innerHTML = content;
  main.textContent = "";
  main.appendChild(message);
}

// Timer for content updates 20 s
const getDataTimer = setInterval(function () {
  getData(queryString);
},20000);


// Timer for clock update 1 s
const updateClockTimer = setInterval(function () {
  updateClock();
},1000);
