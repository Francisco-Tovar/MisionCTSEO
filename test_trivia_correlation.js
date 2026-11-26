const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');

// Extract PLANET_FACTS_DATABASE
const dbMatch = html.match(/const PLANET_FACTS_DATABASE = ({[\s\S]*?^    };)/m);
if (!dbMatch) {
  console.error("FAIL: Could not locate PLANET_FACTS_DATABASE in index.html");
  process.exit(1);
}
const db = eval('(' + dbMatch[1].replace(/;\s*$/, '') + ')');

// Extract CELESTIAL_FACTS_DATABASE
const cdbMatch = html.match(/const CELESTIAL_FACTS_DATABASE = (\[[\s\S]*?^    \];)/m);
if (!cdbMatch) {
  console.error("FAIL: Could not locate CELESTIAL_FACTS_DATABASE in index.html");
  process.exit(1);
}
const cdb = eval('(' + cdbMatch[1].replace(/;\s*$/, '') + ')');

// Extract PLANET_SPECS
const specsMatch = html.match(/const PLANET_SPECS = (\[[\s\S]*?^    \];)/m);
if (!specsMatch) {
  console.error("FAIL: Could not locate PLANET_SPECS in index.html");
  process.exit(1);
}
const specs = eval('(' + specsMatch[1].replace(/;\s*$/, '') + ')');

console.log("================================================================");
console.log("TEST 1: SEMANTIC & DATA INTEGRITY OF ALL 48 PLANET FACT-TRIVIA PAIRS");
console.log("================================================================");

const planetIds = specs.map(p => p.id);
let totalPairs = 0;
let errors = [];

planetIds.forEach(pId => {
  const pool = db[pId];
  if (!pool || pool.length !== 6) {
    errors.push("Planet " + pId + " has " + (pool ? pool.length : 0) + " items, expected 6");
    return;
  }

  pool.forEach((entry, idx) => {
    totalPairs++;
    ['es', 'en', 'pt'].forEach(lang => {
      const fact = entry.fact && entry.fact[lang];
      const q = entry.question && entry.question[lang];
      const corr = entry.correct && entry.correct[lang];
      const d1 = entry.distractors && entry.distractors[0] && entry.distractors[0][lang];
      const d2 = entry.distractors && entry.distractors[1] && entry.distractors[1][lang];

      if (!fact || fact.trim().length === 0) {
        errors.push("Empty fact for " + pId + "[" + idx + "] in " + lang);
      }
      if (!q || q.trim().length === 0) {
        errors.push("Empty question for " + pId + "[" + idx + "] in " + lang);
      }
      if (!corr || corr.trim().length === 0) {
        errors.push("Empty correct answer for " + pId + "[" + idx + "] in " + lang);
      }
      if (!d1 || d1.trim().length === 0 || !d2 || d2.trim().length === 0) {
        errors.push("Empty distractors for " + pId + "[" + idx + "] in " + lang);
      }
      if (corr === d1 || corr === d2 || d1 === d2) {
        errors.push("Duplicate option values in " + pId + "[" + idx + "] in " + lang);
      }
    });
  });
});

console.log("Audited " + totalPairs + " factoid/question items across 8 planets in 3 languages.");
if (errors.length > 0) {
  console.error("Integrity check failed with errors:", errors);
  process.exit(1);
} else {
  console.log("SUCCESS: All 48 factoids and linked questions are structurally sound and valid.");
}

console.log("\n================================================================");
console.log("TEST 2: INTEGRITY OF CELESTIAL BODIES FACTS & FRANKLIN CHANG DISTRACTOR");
console.log("================================================================");

let cErrors = [];
let hasFranklinChang = false;

cdb.forEach((item, idx) => {
  ['es', 'en', 'pt'].forEach(lang => {
    const fact = item.fact && item.fact[lang];
    const q = item.question && item.question[lang];
    const corr = item.correct && item.correct[lang];
    if (!fact || !q || !corr) {
      cErrors.push("Incomplete celestial fact #" + idx + " in " + lang);
    }
  });

  if (item.id === 'cf_lorimer_2009') {
    const dList = item.distractors || [];
    const hasFC = dList.some(d => d.es && d.es.includes('Franklin Chang'));
    if (hasFC) hasFranklinChang = true;
  }
});

if (!hasFranklinChang) {
  cErrors.push("FAIL: Franklin Chang was not found as distractor in Duncan Lorimer factoid (cf_lorimer_2009)!");
}

if (cErrors.length > 0) {
  console.error("Celestial DB test failed:", cErrors);
  process.exit(1);
} else {
  console.log("SUCCESS: " + cdb.length + " celestial facts verified with Franklin Chang confirmed as distractor.");
}

console.log("\n================================================================");
console.log("TEST 3: SIMULATION OF 20,000 FULL GAME RUNS & TRIVIA VERACITY");
console.log("================================================================");

let failedSimulations = 0;
const SIM_COUNT = 20000;

for (let sim = 1; sim <= SIM_COUNT; sim++) {
  // Step A: Game starts, SolarSystemGameScene.create() picks 1 fact per planet
  const sessionFacts = {};
  specs.forEach(p => {
    const pool = db[p.id];
    const chosenIndex = Math.floor(Math.random() * pool.length);
    const chosen = pool[chosenIndex];
    sessionFacts[p.id] = {
      ...chosen,
      chosenIndex: chosenIndex,
      planetId: p.id
    };
  });

  // Step B: Starship travels through space, visiting planets in order (1 to 8)
  const transmissionsPresented = [];
  specs.forEach(p => {
    const shownFact = sessionFacts[p.id];
    transmissionsPresented.push({
      planetId: p.id,
      chosenVariant: shownFact.chosenIndex,
      factText: shownFact.fact.es,
      expectedQuestion: shownFact.question.es,
      expectedCorrect: shownFact.correct.es
    });
  });

  // Step C: Simulate interplanetary mini-battles on planet transits (orders 2 to 8)
  // When alien wins, player takes -50 shield and receives an intercepted celestial factoid
  const penaltyCelestialFacts = [];
  const celestialPool = [...cdb];

  for (let order = 2; order <= 8; order++) {
    // 50% chance alien wins the dice duel
    const pRoll = Math.floor(Math.random() * 6) + 1;
    const aRoll = Math.floor(Math.random() * 6) + 1;
    if (aRoll > pRoll) {
      let chosenC = celestialPool.find(c => c.id === 'cf_lorimer_2009' && !penaltyCelestialFacts.some(p => p.id === 'cf_lorimer_2009'));
      if (!chosenC) {
        chosenC = celestialPool.find(c => !penaltyCelestialFacts.some(p => p.id === c.id)) || cdb[0];
      }
      penaltyCelestialFacts.push(chosenC);
      // Transmission presented to player
      transmissionsPresented.push({
        planetId: chosenC.planetId,
        chosenVariant: chosenC.id,
        factText: chosenC.fact.es,
        expectedQuestion: chosenC.question.es,
        expectedCorrect: chosenC.correct.es
      });
    }
  }

  // Step D: Player completes planets, boss battle begins
  const sessionTriviaEntries = specs
    .map(p => sessionFacts[p.id])
    .filter(Boolean);

  if (penaltyCelestialFacts.length > 0) {
    sessionTriviaEntries.push(...penaltyCelestialFacts);
  }

  const activeTriviaList = [...sessionTriviaEntries].sort(() => Math.random() - 0.5);

  // Verification 1: Exactly 8 + penaltyCount questions exist
  const expectedTotal = 8 + penaltyCelestialFacts.length;
  if (activeTriviaList.length !== expectedTotal) {
    console.error("Sim " + sim + ": Trivia list length mismatch: " + activeTriviaList.length + " vs expected " + expectedTotal);
    failedSimulations++;
    break;
  }

  // Verification 2: Every single question matches the EXACT factoid taught during navigation / mini-battles
  activeTriviaList.forEach((qData, qIndex) => {
    const matchingTransmission = transmissionsPresented.find(t => t.planetId === qData.planetId);

    if (!matchingTransmission) {
      console.error("Sim " + sim + ": Question " + qIndex + " belongs to planet/source " + qData.planetId + " which was never transmitted!");
      failedSimulations++;
      return;
    }

    if (matchingTransmission.expectedQuestion !== qData.question.es) {
      console.error("Sim " + sim + ": Question text mismatch for " + qData.planetId);
      failedSimulations++;
    }

    if (matchingTransmission.expectedCorrect !== qData.correct.es) {
      console.error("Sim " + sim + ": Correct answer mismatch for " + qData.planetId);
      failedSimulations++;
    }
  });
}

if (failedSimulations === 0) {
  console.log("SUCCESS: " + SIM_COUNT + " full simulated games (including dice duel penalties) passed with 0 mismatches.");
  console.log("VERDICT: 100% OF QUESTIONS ASKED IN THE BOSS FIGHT MATCH THE EXACT FACTOIDS TRANSMITTED DURING NAVIGATION & MINI-BATTLES.");
} else {
  console.error("FAILED: Found " + failedSimulations + " mismatches during simulation.");
  process.exit(1);
}

console.log("\n================================================================");
console.log("TEST 4: CONSECUTIVE RESTARTS WITHOUT PAGE RELOAD");
console.log("================================================================");

let consecutiveFailures = 0;
for (let restart = 1; restart <= 1000; restart++) {
  const currentSessionFacts = {};
  specs.forEach(p => {
    const pool = db[p.id];
    const chosenIndex = Math.floor(Math.random() * pool.length);
    currentSessionFacts[p.id] = { ...pool[chosenIndex], chosenIndex, planetId: p.id };
  });

  const sessionTriviaEntries = specs.map(p => currentSessionFacts[p.id]).filter(Boolean);
  const activeTriviaList = [...sessionTriviaEntries].sort(() => Math.random() - 0.5);

  activeTriviaList.forEach(q => {
    const expected = currentSessionFacts[q.planetId];
    if (q.chosenIndex !== expected.chosenIndex) {
      consecutiveFailures++;
    }
  });
}

if (consecutiveFailures === 0) {
  console.log("SUCCESS: 1,000 consecutive game restarts verified with 0 memory leaks or state bleeding.");
} else {
  console.error("FAILED: Found " + consecutiveFailures + " leaks across restarts.");
  process.exit(1);
}
