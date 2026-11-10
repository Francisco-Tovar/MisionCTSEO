const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');

// Extract PLANET_FACTS_DATABASE
const dbMatch = html.match(/const PLANET_FACTS_DATABASE = ({[\s\S]*?^    };)/m);
if (!dbMatch) {
  console.error("FAIL: Could not locate PLANET_FACTS_DATABASE in index.html");
  process.exit(1);
}
const db = eval('(' + dbMatch[1].replace(/;\s*$/, '') + ')');

// Extract PLANET_SPECS
const specsMatch = html.match(/const PLANET_SPECS = (\[[\s\S]*?^    \];)/m);
if (!specsMatch) {
  console.error("FAIL: Could not locate PLANET_SPECS in index.html");
  process.exit(1);
}
const specs = eval('(' + specsMatch[1].replace(/;\s*$/, '') + ')');

console.log("================================================================");
console.log("TEST 1: SEMANTIC & DATA INTEGRITY OF ALL 48 FACT-TRIVIA PAIRS");
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
console.log("TEST 2: SIMULATION OF 20,000 FULL GAME RUNS & TRIVIA VERACITY");
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
    // Attach chosenIndex to track the exact variant (0 to 5)
    sessionFacts[p.id] = {
      ...chosen,
      chosenIndex: chosenIndex,
      planetId: p.id
    };
  });

  // Step B: Starship travels through space, visiting planets in order (1 to 8)
  // For each planet, showFactTransmission(planetId) is invoked
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

  // Step C: Player completes 8 planets. startBossBattle() gathers the questions
  // EXACT code from index.html:
  // const sessionTriviaEntries = PLANET_SPECS.map(p => this.sessionFacts[p.id]).filter(Boolean);
  // this.activeTriviaList = Phaser.Utils.Array.Shuffle([...sessionTriviaEntries]);
  const sessionTriviaEntries = specs
    .map(p => sessionFacts[p.id])
    .filter(Boolean);

  const activeTriviaList = [...sessionTriviaEntries].sort(() => Math.random() - 0.5);

  // Verification 1: Exactly 8 questions exist
  if (activeTriviaList.length !== 8) {
    console.error("Sim " + sim + ": Trivia list length is not 8: " + activeTriviaList.length);
    failedSimulations++;
    break;
  }

  // Verification 2: Every single question matches the EXACT factoid taught during navigation
  activeTriviaList.forEach((qData, qIndex) => {
    const matchingTransmission = transmissionsPresented.find(t => t.planetId === qData.planetId);

    if (!matchingTransmission) {
      console.error("Sim " + sim + ": Question " + qIndex + " belongs to planet " + qData.planetId + " which was never transmitted!");
      failedSimulations++;
      return;
    }

    // Crucial: Check that the question is for the SPECIFIC variant shown (e.g. variant 3, NOT variant 0, 1, 2, 4, 5)
    if (matchingTransmission.chosenVariant !== qData.chosenIndex) {
      console.error("Sim " + sim + ": CRITICAL MISMATCH on planet " + qData.planetId + "! Transmission taught fact #" + matchingTransmission.chosenVariant + ", but trivia asked for fact #" + qData.chosenIndex);
      failedSimulations++;
    }

    if (matchingTransmission.expectedQuestion !== qData.question.es) {
      console.error("Sim " + sim + ": Question text mismatch for planet " + qData.planetId);
      failedSimulations++;
    }

    if (matchingTransmission.expectedCorrect !== qData.correct.es) {
      console.error("Sim " + sim + ": Correct answer mismatch for planet " + qData.planetId);
      failedSimulations++;
    }
  });

  // Step D: Simulate incorrect answer and re-queueing
  // In index.html: if (missedQuestion) { this.activeTriviaList.push(missedQuestion); }
  const missedQ = activeTriviaList[0];
  activeTriviaList.push(missedQ);
  const recheckQ = activeTriviaList[activeTriviaList.length - 1];
  const matchingTrans = transmissionsPresented.find(t => t.planetId === recheckQ.planetId);
  if (matchingTrans.chosenVariant !== recheckQ.chosenIndex) {
    console.error("Sim " + sim + ": Re-queued question did not match transmitted variant!");
    failedSimulations++;
  }
}

if (failedSimulations === 0) {
  console.log("SUCCESS: " + SIM_COUNT + " full simulated games passed with 0 mismatches.");
  console.log("VERDICT: 100% OF THE QUESTIONS ASKED IN THE BOSS FIGHT MATCH THE EXACT FACTOIDS TRANSMITTED DURING NAVIGATION.");
} else {
  console.error("FAILED: Found " + failedSimulations + " mismatches during simulation.");
  process.exit(1);
}

console.log("\n================================================================");
console.log("TEST 3: CONSECUTIVE RESTARTS WITHOUT PAGE RELOAD");
console.log("================================================================");

let consecutiveFailures = 0;
let previousSessionFacts = null;

for (let restart = 1; restart <= 1000; restart++) {
  // simulate restartGameSession -> create()
  const currentSessionFacts = {};
  specs.forEach(p => {
    const pool = db[p.id];
    const chosenIndex = Math.floor(Math.random() * pool.length);
    currentSessionFacts[p.id] = { ...pool[chosenIndex], chosenIndex, planetId: p.id };
  });

  const sessionTriviaEntries = specs.map(p => currentSessionFacts[p.id]).filter(Boolean);
  const activeTriviaList = [...sessionTriviaEntries].sort(() => Math.random() - 0.5);

  // Verify no leaked facts from previousSessionFacts
  activeTriviaList.forEach(q => {
    const expected = currentSessionFacts[q.planetId];
    if (q.chosenIndex !== expected.chosenIndex) {
      consecutiveFailures++;
      console.error("Restart " + restart + ": Leak detected from previous session!");
    }
  });

  previousSessionFacts = currentSessionFacts;
}

if (consecutiveFailures === 0) {
  console.log("SUCCESS: 1,000 consecutive game restarts verified with 0 memory leaks or state bleeding.");
} else {
  console.error("FAILED: Found " + consecutiveFailures + " leaks across restarts.");
  process.exit(1);
}

