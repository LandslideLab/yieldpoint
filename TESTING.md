# TESTING.md — YieldPoint 完整测试报告

> 记录 `yieldpoint@0.1.0` 开发交付时的全部验证结果。目标：证明交付时代码无已知问题。
>
> 所有命令在 `/workspace`（或注明的工作目录）执行，测试时间：2026-08-14（UTC）。

## 1. 测试环境

| 项目 | 版本/值 |
| --- | --- |
| OS | Linux (devbox) |
| Node.js | v22.22.0 |
| npm | 10.9.4 |
| git | 2.39.5 |
| typescript | 6.0.3 |
| tsup | 8.5.1 |
| vitest | 4.1.10 |
| eslint | 10.8.1 |
| tsx | 4.23.12 |

## 2. 结论摘要

| 验证项 | 结果 |
| --- | --- |
| 单元测试（vitest） | **11 个测试文件 / 155 个用例全部通过** |
| 覆盖率（90% 阈值） | lines **99.2%** / branches **95.72%** / funcs **98.91%** / stmts **98.54%**，全部达标 |
| 静态检查（eslint） | 通过，0 error / 0 warning |
| 类型检查（tsc --noEmit） | 通过 |
| 构建（tsup） | ESM + CJS + 双套类型声明全部成功 |
| demo（medical-assistant） | 4 个移交场景 + simulate 报告 + 原生 agent loop 全部正确 |
| 消费者端到端安装 | CJS / ESM / 子路径适配器 / TS 类型解析 / 零运行时依赖全部通过 |
| npm pack | 成功生成 tarball，内容完整 |

**覆盖率全局汇总**：All files → Stmts 98.54% / Branch 95.72% / Funcs 98.91% / Lines 99.2%

## 3. 自动化测试（vitest）

运行命令：`npm run test:coverage`（`vitest run --coverage`），结果摘要：

| 测试文件 | 用例数 | 状态 |
| --- | --- | --- |
| test/levels.test.ts | 6 | 通过 |
| test/signals.test.ts | 9 | 通过 |
| test/trigger.test.ts | 23 | 通过 |
| test/policy.test.ts | 13 | 通过 |
| test/engine.test.ts | 42 | 通过 |
| test/simulate.test.ts | 14 | 通过 |
| test/index.test.ts | 12 | 通过 |
| test/adapters/langgraph.test.ts | 7 | 通过 |
| test/adapters/openai-agents.test.ts | 8 | 通过 |
| test/adapters/vercel-ai-sdk.test.ts | 11 | 通过 |
| test/adapters/agent-loop.test.ts | 10 | 通过 |
| **合计** | **155** | **全部通过** |

耗时约 2s，无 flaky、无 pending、无 skip。

## 4. 覆盖率明细（v8 provider）

```
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |   98.54 |    95.72 |   98.91 |    99.2 |
 src               |   98.59 |    97.19 |     100 |   99.22 |
  context.ts       |       0 |        0 |       0 |       0 |
  engine.ts        |   97.36 |    94.91 |     100 |   98.14 | 91,287
  events.ts        |     100 |      100 |     100 |     100 |
  index.ts         |       0 |        0 |       0 |       0 |
  levels.ts        |     100 |      100 |     100 |     100 |
  policy.ts        |     100 |    97.77 |     100 |     100 | 51
  signals.ts       |     100 |      100 |     100 |     100 |
  simulate.ts      |    98.7 |    96.96 |     100 |     100 | 255
  trigger.ts       |     100 |    98.03 |     100 |     100 | 110
 src/adapters      |   98.44 |    92.22 |   96.29 |   99.15 |
  agent-loop.ts    |     100 |    96.15 |     100 |     100 | 144
  langgraph.ts     |      96 |       85 |   85.71 |     100 | 56,104-112
  openai-agents.ts |     100 |     91.3 |     100 |     100 | 66,118
  vercel-ai-sdk.ts |   97.56 |    95.23 |     100 |   97.22 | 88
```

说明：
- `context.ts` / `index.ts` 为纯导出（无逻辑），未计入执行语句，属预期。
- vitest.config.mts 已配置 `thresholds`：lines/branches/functions/statements 均 ≥ 90，未达标会使测试失败。

## 5. 静态检查与类型检查

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| ESLint | `npm run lint`（`eslint .`） | 0 error，0 warning |
| TypeScript | `npm run typecheck`（`tsc --noEmit`） | 通过，无类型错误 |

## 6. 构建产物验证

命令：`npm run build`（`tsup`，target es2020）。产物：

- ESM：`dist/index.mjs` + `dist/adapters/*.mjs`（4 个适配器）
- CJS：`dist/index.js` + `dist/adapters/*.js`
- 类型声明：`dist/index.d.ts` / `.d.mts` + 每个适配器 `.d.ts` / `.d.mts`
- source map 全套

`package.json` 的 `exports` 使用嵌套条件格式，import → `.mjs`/`.d.mts`，require → `.js`/`.d.ts`，子路径 `yieldpoint/adapters/*` 均已声明。

## 7. demo 运行验证

命令：`npx tsx demo/medical-assistant.ts`（exit=0），完整输出：

```
=== YieldPoint: Dynamic Power Handover (medical demo) ===

=== Autonomy scale ===
   operator     score=0
   collaborator score=1
   consultant   score=2
   approver     score=3
   observer     score=4
   machine-only score=5

=== 1. Task traces ===

[Task 1] "Schedule the follow-up visit" (low risk, high confidence)
   step -> level=machine-only changed=false
   step -> level=machine-only changed=false
   autonomy stays 'machine-only' -- 0 handovers, zero human involvement.

[Task 2] "Prescribe clozapine 25mg" (requires approval)
   [handover] policy: machine-only (5) -> approver (3) -- rule 'prescription-gate' matched 1 trigger(s)
   level now 'approver' -- waiting for the doctor.
   [handover] human: approver (3) -> machine-only (5) -- Doctor approved the prescription

[Task 3] "Patient vitals crashing" (emergency)
   [handover] policy: machine-only (5) -> operator (0) -- rule 'emergency' matched 1 trigger(s)
   level now 'operator' -- clinician has full control.

[Task 4] "Patient asks to speak with a nurse"
   [handover] policy: machine-only (5) -> collaborator (1) -- rule 'human-request' matched 1 trigger(s)
   level now 'collaborator' -- assistant assists the nurse.

=== 2. Policy evaluation (simulate) ===
=== YieldPoint Simulation Report ===

Scenario: routine-scheduling
  Low-risk admin, machine should stay autonomous
  quality=0.99 safety=1 autonomy=1 cost=0
  steps=2 safe=2 unsafe=0 transfers=0

Scenario: high-risk-prescription
  Prescribing requires human approval
  quality=0.9 safety=1 autonomy=0.6 cost=1
  steps=2 safe=2 unsafe=0 transfers=1

Scenario: emergency-escalation
  Vitals crash, clinician must take over immediately
  quality=1 safety=1 autonomy=0 cost=5
  steps=2 safe=2 unsafe=0 transfers=1

Scenario: uncertain-diagnosis
  Model is unsure, policy must dial autonomy down
  quality=0.7 safety=1 autonomy=0.6 cost=1
  steps=2 safe=2 unsafe=0 transfers=1

Scenario: patient-requested-human
  Patient asks for a human, assistant must yield
  quality=1 safety=1 autonomy=0.2 cost=5
  steps=2 safe=2 unsafe=0 transfers=1

--- Aggregate ---
quality=0.918 safety=1 autonomy=0.48 cost=12
safetyRate=1 (10/10 steps)
scenarios=5 transfers=4 humanExecuted=4 hitlSteps=8
=== End Report ===

=== 3. Native agent loop ===
   machine step 1 at 'machine-only'
   machine step 2 at 'machine-only'
   machine step 3 at 'machine-only'
   loop finished: reason='done' steps=3 finalLevel='machine-only' output={"appointmentsBooked":3}

Demo complete.
```

验证点全部符合预期：低风险全自主、高风险转审批、急诊立即接管、患者请求转人工、simulate 报告 safetyRate=1（10/10 步安全）、agent loop 正常完成。

## 8. 消费者端到端安装测试

用 `npm pack` 生成的 tarball 在全新目录 `/tmp/opencode/consumer` 中 `npm install`（非 link），模拟真实消费者：

```
runtime deps: {}                     ← 零运行时依赖
CJS core: true approver doubt        ← require('yieldpoint') 主入口可用
CJS simulate safetyRate: 1
CJS adapters: function function function function 6   ← 4 个子路径适配器可 require
ALL CJS CONSUMER CHECKS PASSED
---
ESM core: true approver              ← import 'yieldpoint' 主入口可用
ESM adapter decide: true             ← import 'yieldpoint/adapters/langgraph' 可用
ESM loop: done
ALL ESM CONSUMER CHECKS PASSED
---
TS TYPE RESOLUTION OK                ← tsc --moduleResolution nodenext 类型解析正确
```

TS 类型验证使用独立安装的 TypeScript，对 `yieldpoint` 主入口、`yieldpoint/adapters/langgraph`、`yieldpoint/adapters/agent-loop`、`runSimulation`/`formatReport`、`HandoverPolicy`/`AutonomyLevel` 类型逐一检查，`tsc --noEmit --strict` 通过。

## 9. npm pack 验证

- `npm pack` 成功生成 `yieldpoint-0.1.0.tgz`。
- tarball 包含 35 个文件：`dist/`（ESM+CJS+类型声明）、`README.md`、`LICENSE`（MIT）、`package.json`。
- `files` 白名单生效，无无关文件进入包。

## 10. 发布状态

- GitHub Actions 已配置：
  - `.github/workflows/ci.yml`：Node 18/20/22 矩阵，跑 lint + typecheck + test(coverage 90% 阈值) + build。
  - `.github/workflows/publish.yml`：`v*` tag 触发，`npm publish --provenance --access public`。
- `prepublishOnly` 已配置完整质量门禁（lint + typecheck + test + build）。
- **未执行实际 `npm publish`**：当前机器未登录 npm（`npm whoami` 返回 ENEEDAUTH）。需要用户提供 npm token（配置为仓库 `NPM_TOKEN` secret 供 publish workflow 使用），或在本地 `npm adduser` 后手动执行 `npm publish`。

## 11. 复现方式

```bash
npm install
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run test:coverage # vitest + 覆盖率（90% 阈值）
npm run build         # tsup ESM+CJS+DTS
npx tsx demo/medical-assistant.ts  # demo
npm pack              # 打包验证
```
