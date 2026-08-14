/**
 * YieldPoint medical-assistant demo.
 *
 * Shows dynamic power handover in a fictional clinical setting:
 *   - low-risk administrative tasks run fully autonomously
 *   - prescribing a medication requires human approval
 *   - emergency signals hand control to a clinician immediately
 *
 * Run with: `npm run demo`  (tsx demo/medical-assistant.ts)
 */
import {
  AUTONOMY_SCORES,
  createHandoverEngine,
  formatReport,
  runSimulation,
  type AutonomyLevel,
  type HandoverEvent,
  type HandoverPolicy,
  type Scenario
} from '../src';
import { runAgentLoop } from '../src/adapters/agent-loop';

const medicalPolicy: HandoverPolicy = {
  name: 'medical-assistant',
  initialLevel: 'machine-only',
  rules: [
    {
      id: 'emergency',
      priority: 30,
      when: [{ type: 'risk', above: 0.7 }],
      to: 'operator'
    },
    {
      id: 'prescription-gate',
      priority: 20,
      when: [{ type: 'custom', test: (c) => c.signals.category === 'prescription' }],
      to: 'approver'
    },
    {
      id: 'low-confidence',
      priority: 10,
      when: [{ type: 'confidence', below: 0.6 }],
      to: 'approver'
    },
    {
      id: 'human-request',
      when: [{ type: 'human-request' }],
      to: 'collaborator'
    }
  ]
};

function trace(label: string, event: HandoverEvent): void {
  console.log(
    `   [handover] ${label}: ${event.from} (${AUTONOMY_SCORES[event.from]}) -> ` +
      `${event.to} (${AUTONOMY_SCORES[event.to]}) -- ${event.reason.description}`
  );
}

function showTaskTraces(): void {
  console.log('\n=== 1. Task traces ===');

  // -- Task 1: low-risk administrative task, fully autonomous
  console.log('\n[Task 1] "Schedule the follow-up visit" (low risk, high confidence)');
  const low = createHandoverEngine(medicalPolicy);
  low.createTask('scheduling');
  for (const signals of [
    { confidence: 0.99, risk: 0.05, category: 'scheduling' },
    { confidence: 0.98, risk: 0.05, category: 'scheduling' }
  ]) {
    const result = low.update('scheduling', signals);
    console.log(`   step -> level=${result.currentLevel} changed=${result.changed}`);
  }
  const lowEvents = low.history('scheduling');
  console.log(
    `   autonomy stays '${low.getContext('scheduling').currentLevel}' -- ` +
      `${lowEvents.length} handovers, zero human involvement.`
  );

  // -- Task 2: high-risk prescription, requires human approval
  console.log('\n[Task 2] "Prescribe clozapine 25mg" (requires approval)');
  const rx = createHandoverEngine(medicalPolicy);
  rx.createTask('prescription');
  const gate = rx.update('prescription', { confidence: 0.9, risk: 0.3, category: 'prescription' });
  if (gate.event) trace('policy', gate.event);
  console.log(`   level now '${rx.getContext('prescription').currentLevel}' -- waiting for the doctor.`);
  const approved = rx.transfer('prescription', 'machine-only', 'Doctor approved the prescription');
  if (approved) trace('human', approved);

  // -- Task 3: emergency escalation
  console.log('\n[Task 3] "Patient vitals crashing" (emergency)');
  const er = createHandoverEngine(medicalPolicy);
  er.createTask('emergency');
  const esc = er.update('emergency', { risk: 0.95, confidence: 0.85, category: 'triage' });
  if (esc.event) trace('policy', esc.event);
  console.log(`   level now '${er.getContext('emergency').currentLevel}' -- clinician has full control.`);

  // -- Task 4: patient requests a human, assistant stays collaborative
  console.log('\n[Task 4] "Patient asks to speak with a nurse"');
  const pt = createHandoverEngine(medicalPolicy);
  pt.createTask('patient-request');
  const req = pt.requestHuman('patient-request');
  if (req.event) trace('policy', req.event);
  console.log(`   level now '${pt.getContext('patient-request').currentLevel}' -- assistant assists the nurse.`);
}

function showSimulation(): void {
  console.log('\n=== 2. Policy evaluation (simulate) ===');

  const scenarios: Scenario[] = [
    {
      name: 'routine-scheduling',
      description: 'Low-risk admin, machine should stay autonomous',
      steps: [
        { signals: { confidence: 0.98, risk: 0.05, category: 'scheduling' }, maxSafeLevel: 'machine-only', quality: 0.99 },
        { signals: { confidence: 0.97, risk: 0.04, category: 'scheduling' }, maxSafeLevel: 'machine-only', quality: 0.99 }
      ]
    },
    {
      name: 'high-risk-prescription',
      description: 'Prescribing requires human approval',
      steps: [
        { signals: { confidence: 0.9, risk: 0.3, category: 'prescription' }, maxSafeLevel: 'approver', quality: 0.9 },
        { signals: { confidence: 0.95, risk: 0.25, category: 'prescription' }, maxSafeLevel: 'approver', quality: 0.9 }
      ]
    },
    {
      name: 'emergency-escalation',
      description: 'Vitals crash, clinician must take over immediately',
      steps: [
        { signals: { confidence: 0.85, risk: 0.95, category: 'triage' }, maxSafeLevel: 'operator', quality: 0.8 },
        { signals: { confidence: 0.9, risk: 0.9, category: 'triage' }, maxSafeLevel: 'operator', quality: 0.8 }
      ]
    },
    {
      name: 'uncertain-diagnosis',
      description: 'Model is unsure, policy must dial autonomy down',
      steps: [
        { signals: { confidence: 0.4, risk: 0.2, category: 'diagnosis' }, maxSafeLevel: 'approver', quality: 0.7 },
        { signals: { confidence: 0.55, risk: 0.2, category: 'diagnosis' }, maxSafeLevel: 'approver', quality: 0.7 }
      ]
    },
    {
      name: 'patient-requested-human',
      description: 'Patient asks for a human, assistant must yield',
      steps: [
        { signals: { confidence: 0.95, risk: 0.1, category: 'support', humanRequest: true }, maxSafeLevel: 'collaborator', quality: 0.95 },
        { signals: { confidence: 0.95, risk: 0.1, category: 'support' }, maxSafeLevel: 'collaborator', quality: 0.95 }
      ]
    }
  ];

  const report = runSimulation(medicalPolicy, scenarios, { defaultHumanCost: 2, transferCost: 1 });
  console.log(formatReport(report));
}

async function showAgentLoop(): Promise<void> {
  console.log('\n=== 3. Native agent loop ===');

  const engine = createHandoverEngine(medicalPolicy);
  engine.createTask('loop');
  let ran = 0;
  const result = await runAgentLoop({
    engine,
    taskId: 'loop',
    runStep: (ctx) => {
      ran += 1;
      console.log(`   machine step ${ran} at '${ctx.level}'`);
      if (ran >= 3) {
        return { output: { appointmentsBooked: 3 }, done: true, signals: { confidence: 0.99, risk: 0.02 } };
      }
      return { signals: { confidence: 0.99, risk: 0.02 } };
    },
    onEvent: (event) => trace('loop', event)
  });
  console.log(
    `   loop finished: reason='${result.reason}' steps=${result.steps} ` +
      `finalLevel='${result.finalLevel}' output=${JSON.stringify(result.output)}`
  );
}

function levelAxis(): void {
  console.log('\n=== Autonomy scale ===');
  for (const level of ['operator', 'collaborator', 'consultant', 'approver', 'observer', 'machine-only'] as AutonomyLevel[]) {
    console.log(`   ${level.padEnd(12)} score=${AUTONOMY_SCORES[level]}`);
  }
}

async function main(): Promise<void> {
  console.log('=== YieldPoint: Dynamic Power Handover (medical demo) ===');
  levelAxis();
  showTaskTraces();
  showSimulation();
  await showAgentLoop();
  console.log('\nDemo complete.');
}

void main();
