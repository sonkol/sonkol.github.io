"use strict";
// Constant definitions
const SETTINGS = {
  "prefix": "https://api.golemio.cz/v2/pid/departureboards/?", // Base URL
  "httpTimeout": 20,
  "offlineText": "<p>Omlouváme se, zařízení je dočasně mimo provoz</p><p>Aktuální odjezdy spojů naleznete na webu pid.cz/odjezdy</p>",
  "dayOfWeek": ["Neděle", "Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota"] // Dictionary of week days
}

// Settings that can be changed
let settings = {
  "showPlatformNumbers": false,
  "offline": 0,
  "lastConnectionTime": undefined,
  "reading": false,
  "infotextContent": undefined
}

  let data = "";

// Default settings of URL parameters
const PARAMETERS = {
  "airCondition": true,
  "aswIds": "539_1",
  "filter": "routeHeadingOnce",
  "limit": 5,
  "skip": "atStop",
  "minutesAfter": 99
}

// Make a copy of parameters which can be edited
let parameters = PARAMETERS;

// Lock it so no unauthorized values cannot be added
Object.seal(parameters);

// Get URL parameters
let searchString = new URLSearchParams(document.location.search);
for (const [key, value] of searchString) {
  parameters[key] = value;
}

// Assure that user input is correct, if not, replace with default values
if (!["true", "false"].includes(parameters.airCondition)) parameters.airCondition = PARAMETERS.airCondition;
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
            data = JSON.parse(this.responseText);

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
  catch (e) {
    fullScreenMessage();
  }
}

// Create rows with departures and insert them into document
function updateContent(data) {

  // Process information texts. If a full page infotext is present, do not render departures
  if (data.infotexts.length > 0) {
    const isGlobalInfotext = processInfoTexts(data.infotexts);
    if (isGlobalInfotext) return;
  }

  // If multiple stops are to be displayed, show column with platform numbers
  const uniqueStops = new Set();
  data.stops.forEach((stop) => {
    uniqueStops.add(stop.asw_id.node + "/" + stop.asw_id.stop);
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
      wheelchair.setAttribute("src", "accessible.svg");
      accessible.appendChild(wheelchair);
    }
    body.appendChild(accessible);

    const airCondition = document.createElement("div");
    airCondition.classList.add("aircondition");
    if (row.trip.is_air_conditioned) {
      const aircondition = document.createElement("img");
      aircondition.setAttribute("src", "snowflake.svg");
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

function processInfoTexts(data) {
  let inline = false,
    general = false,
    general_alternate = false, // Switches that control the display of listed board classes
    referenceString = "";

  // Here the strings will be stored   
  let infotexts = {
    "inline": [],
    "general": []
  };

  for (const text of data) {
    if (text.display_type === "inline") {
      if (text.text) infotexts.inline.push(text.text.trim());
      if (text.text_en) infotexts.inline.push(text.text_en.trim());
      inline = true;
    }
    else {
      if (text.text) infotexts.general.push(text.text.trim());
      if (text.text_en) infotexts.general.push(text.text_en.trim());
      // Selects the correct display mode TODO support for alternate
      (text.display_type === "general-alternate") ? general_alternate = true : general = true;
    }

    // This will be used to compare if infotexts froom previous refresh did change
    referenceString += text.display_type+text.text+text.text_en;
  }

  // If the text content and infotext types are the same, do not redraw
  if (referenceString === settings.infotextContent) {
    return general === true;
  }

  // Update the string for future comparision
  settings.infotextContent = referenceString

  // One-liners
  const infotextBar = document.getElementById("infotext");
  const dateBar = document.getElementById("date");
  if (inline) {
    // Non-overflowing (short) information text is static
    infotextBar.innerHTML = infotexts.inline.join(" • ");  // Separator for future reference: • 
    infotextBar.style.display = "flex";
    dateBar.style.display = "none";
  }
  if (inline && infotextBar.scrollWidth > infotextBar.clientWidth) {
    // If text overflows it will be animated
    infotextBar.classList.add("marquee");
    infotextBar.textContent = "";
    const infotextcontent = document.createElement("div");
    infotextcontent.classList.add("infotextcontent");
    infotextcontent.textContent = infotexts.inline.join(" *** ");
    infotextBar.appendChild(infotextcontent);
    infotextBar.appendChild(infotextcontent.cloneNode(true));
  }
  else {
      infotextBar.style.display = "none";
      dateBar.style.display = "flex";
    }

  // Full screen messages
  if (general || general_alternate) {
    settings.infotextGeneral = true;
    fullScreenMessage(infotexts.general.join(" *** "));
  }
  else {
    settings.infotextGeneral = false;
  }

  return general === true;
}

// Text to speech
// Convert route numbers with letters to pronounced separate letters
function mixedNumberToWords(inputString) {
  if (inputString.length === 0) {
      return "";
  }
  const letters = { a: "á", b: "bé", c: "cé", č: "čé", d: "dé", e: "é", f: "ef", g: "gé", h: "há", i: "í", j: "jé", k: "ká", l: "el", m: "em", n: "en", o: "ó", p: "pé", q: "kvé", r: "er", s: "e:s", š: "eš", t: "té", u: "ú", v: "vé", w: "dvojité vé", x: "iks", y: "y", z: "zed" };
  const separateLettersNumbers = new RegExp(/\p{L}+|\p{N}+/ug);
  let output = [];
  const block = inputString.match(separateLettersNumbers);
  block.forEach((item) => {
      if (/^\p{Lu}{1,2}$/ug.test(item)) {
          item.split("").forEach(
              (letter) => {
                  output.push(letters[letter.toLowerCase()]);
              }
          )
      }
      else output.push(digitsToWords(item));
  });

  return output.join(" ");
}

// Convert digits to word strings (works for numbers smaller than 9999)
function digitsToWords(number) {
  if (number.length === 0) return "";
  const quadDigit = new RegExp("[1-9][0-9]{0,3}");
  if (!quadDigit.test(number)) return number;
  number = parseInt(number, 10).toString();
  const basics = ["", "jedna", "dva", "tři", "čtyři", "pět", "šest", "sedm", "osm", "devět", "deset", "jedenáct", "dvanáct", "třináct", "čtrnáct", "patnáct", "šestnáct", "sedmnáct", "osmnáct", "devatenáct"];
  const tens = [, "deset", "dvacet", "třicet", "čtyřicet", "padesát", "šedesát", "sedmdesát", "osmdesát", "devadesát"];
  const hundreds = [, "sto ", "dvěstě ", "třista ", "čtyřista ", "pětset ", "šestset ", "sedmset ", "osmset ", "devětset "];
  if (number === 0) return "nula";
  if (number <= 19) return basics[number];
  if (number <= 99) return tens[number.slice(0, 1)] + basics[number.slice(1)];
  if (number <= 999 && number % 100 === 0) return hundreds[number.slice(0, 1)]; // Handle whole hundreds
  if (number <= 999) return hundreds[number.slice(0, 1)] + digitsToWords(number.slice(1));
  return number;
}

// Numeric keys will trigger reading identically to VPN remote control
document.addEventListener('keydown', function (event) {
  // Reset pause button inactivity timer
  if (settings.inactivityTimer > 0) clearTimeout(settings.inactivityTimer);
  switch (event.key) {
      case "1":
          // Read title of departure board
          readOutLoud(prepareReadOutHeader(data));
          event.preventDefault();
          break;
      case "5":
          // Pause
          if (window.speechSynthesis.paused) {
              window.speechSynthesis.resume();
          }
          else if (!window.speechSynthesis.paused && window.speechSynthesis.speaking) {
              window.speechSynthesis.pause();
              settings.inactivityTimer = setTimeout(function () { window.speechSynthesis.cancel() }, 10000);
          }
          event.preventDefault();
          break;
      case "6":
          // Read list of departures
          readOutLoud(prepareReadOutDepartures(data));
          event.preventDefault();
          break;
  }
});

function prepareReadOutHeader(data) {
  let uniquePlatforms = new Set();
  for (const stop of data.stops) {
    uniquePlatforms.add(mixedNumberToWords(stop.platform_code));
  }
 return data.stops[0].stop_name + " stanoviště " + [...uniquePlatforms].join("– a");
}

function prepareReadOutDepartures(data) {
  // Store the text to be spoken
  let sentences = [];
  
  // Fallback
  if (!data) {
    sentences.push("Zastávka je nyní bez provozu");
    return sentences;
  }

  // Shortcut if no departures available
  if (data.departures.length === 0) {
    sentences.push("V blízké době není naplánovaný žádný odjezd.");
    return sentences;
  }

  // GTFS mode translation table
  const transportMode = ["Tramvaj", "Metro", "Vlak", "Autobus", "Přívoz", , "Visutá lanovka", "Lanovka", , "Trolejbus"];

  // Prepare infotext
  if (data.infotexts.length > 0) {
    for (const informationText of data.infotexts) {
      // Convert numbers in the text to words
      informationText.text = informationText.text.replace(/(\d+)/g, function (match) {
        return (digitsToWords(match));
      });
      sentences.push(informationText.text);
    }
  }

  // Get number of displayed rows so we don't say more than necessary
  const rowLimit = document.getElementsByClassName("route").length;
  let counter = 1;

  // Flip through every departure and prepare a sentence
  for (const departure of data.departures) {
    if (counter > rowLimit) break;
    counter++;
    /* The sentence format depends on the display format
    Autobus 119 směr Letiště odjede za 5 minut. */
    let prepareSentence;
    const time = departure.departure_timestamp.minutes;
    const platform = (settings.showPlatformNumbers && departure.stop.platform_code !== null) ? "z nástupiště " + mixedNumberToWords(departure.stop.platform_code) : "";

    // Calculate the time to arrival
    // Patch together the sentence
    prepareSentence = `${transportMode[departure.route.type]} ${mixedNumberToWords(departure.route.short_name)} směr ${departure.trip.headsign} odjede ${platform} za `
    if (time == "<1") prepareSentence += "méně než jednu minutu."
    else if (time <= 1) prepareSentence += "jednu minutu."
    else if (time == 2) prepareSentence += "dvě minuty."
    else if (time > 2 && time < 5) prepareSentence += digitsToWords(time) + " minuty."
    else prepareSentence += digitsToWords(time) + " minut.";
    sentences.push(prepareSentence);
  }

  return sentences;
}

// Load sounds
function playChime(file) {
  return new Promise(function (resolve, reject) {
    const sound = new Audio(`${file}.mp3`);
    sound.onerror = reject;
    sound.onended = resolve;
    sound.play();
  });
}

function endRead() {
  playChime("end");
  settings.reading = false;
};

async function readOutLoud(sentences) {
  // Do not read if other reading is in progress
  if (settings.reading && !window.speechSynthesis.paused || window.speechSynthesis.pending) return false;
  // If starting from a paused state, free the speech queue so we can start again
  if (window.speechSynthesis.paused) window.speechSynthesis.cancel();
  settings.reading = true;
  const say = new SpeechSynthesisUtterance(sentences);
  say.lang = "cs-CZ";
  // Speak the texts with intro and outro chimes
  await playChime("start");
  window.speechSynthesis.speak(say);
  say.onend = function () { endRead() };
  say.oncancel = function () { endRead() };
  /* TTS template
   <gong>
   Zastávka <StopName>. Čas <h> hodin, <m> minut.
   If format minutes: <VehicleType> <RouteNumber> směr <Destination> [odjezd | příjezd] za <min> minutu.
   <cvak>
   */
}

function updateClock() {
  const now = new Date();
  const date = SETTINGS.dayOfWeek[now.getDay()] +
    " " +
    now.getDate().toString().padStart(2, "0") +
    ".&thinsp;" +
    (now.getMonth() + 1).toString().padStart(2, "0") +
    ".&thinsp;" +
    now.getFullYear().toString().padStart(2, "0");
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  document.getElementById("date").innerHTML = date;
  document.getElementById("hours").textContent = hours;
  document.getElementById("minutes").textContent = minutes;
}

// Set fullscreen information text
function fullScreenMessage(content = "") {
  const main = document.getElementsByTagName("main")[0];
  const message = document.getElementById("fullscreen-text").content.cloneNode(true);
  message.firstChild.innerHTML = content;
  main.textContent = "";
  main.appendChild(message);
}

// Timer for content updates 20 s
const getDataTimer = setInterval(function () {
  getData(queryString);
}, 20000);


// Timer for clock update 1 s
const updateClockTimer = setInterval(function () {
  updateClock();
}, 1000);
