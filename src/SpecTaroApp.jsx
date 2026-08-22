import { useMemo, useState } from "react";
import "./spectaro.css";
import "./lamp-brand.css";
import "./guide-avatar-image.css";
import guidePortrait from "./assets/lamp-oyaji-office.png";
import { HttpRequirementsAI } from "./requirements-ai-client.js";
import { processingFailureState, retryableOperation } from "./negotiation-retry-state.js";
import {
  SOURCE,
  applyCriticalDecisionCoverageAudit,
  applyAnalysis,
  buildRepairDiagnostics,
  buildSessionTrace,
  buildMarkdown,
  calculatedConversationProgress,
  completionGate,
  confirmFinalDecisions,
  createProjectContext,
  enableCriticalDecisionCoverageAudit,
  ensureCompletionQuestion,
  majorDecisions,
  monotonicDisplayProgress,
  planNext,
  recordAnswer,
  recordInference,
  registerFinalConfirmation,
  runSpecRepairPipeline,
  setDimensions,
  sourceCounts,
} from "./requirements-core.js";

const thinkingLines = ["ふむふむ……", "願いを整理してるところだ。", "矛盾がないか見てるぜ。", "次に聞くべきことを考えてる。"];
const blank = () => ({ phase: "start", context: null, question: null, busy: false, error: "", showWhy: false, detailMode: false, markdown: "", thinkingLine: thinkingLines[0], displayProgress: 0, failedOperation: null });

function GuideAvatar({ thinking = false, compact = false }) {
  return <div className={`guide-avatar ${thinking ? "is-thinking" : ""} ${compact ? "is-compact" : ""}`}><img src={guidePortrait} alt="ランプのおやじ ネゴシエーター" /></div>;
}

function Progress({ context, displayProgress }) {
  const answered = context?.answeredQuestionKeys?.length ?? 0;
  const percent = displayProgress ?? 0;
  return <header className="conversation-progress"><span>回答済み {answered} 件</span><div aria-label={`具現化度 ${percent}%`} className="progress-track"><span style={{ width: `${percent}%` }} /></div><strong>具現化度 {percent}%</strong></header>;
}

export default function SpecTaroApp({ ai = new HttpRequirementsAI() }) {
  const [idea, setIdea] = useState("");
  const [freeAnswer, setFreeAnswer] = useState("");
  const [state, setState] = useState(blank);
  const counts = useMemo(() => state.context ? sourceCounts(state.context) : null, [state.context]);
  const logSessionTrace = (context, extra = {}) => {
    if (import.meta.env.DEV && context) console.info("[spec-session-trace]", buildSessionTrace(context, extra));
  };
  const logTransition = (from, to, context, extra = {}) => {
    if (import.meta.env.DEV) console.info("[negotiation-state]", { from, to, sessionId: context?.sessionId ?? null, decisionFingerprint: context?.finalConfirmationFingerprint ?? null, ...extra });
  };

  const fail = (error, failedOperation) => setState((current) => processingFailureState(current, error, failedOperation));
  const showThinking = (context, lineIndex = 0) => setState((current) => ({ ...current, context, question: null, busy: true, error: "", failedOperation: null, phase: "thinking", thinkingLine: thinkingLines[lineIndex % thinkingLines.length], displayProgress: monotonicDisplayProgress(current.displayProgress, calculatedConversationProgress(context)) }));
  const continueWith = (context, detailMode = state.detailMode) => {
    const completedContext = ensureCompletionQuestion(context);
    const question = planNext(completedContext, detailMode);
    logSessionTrace(completedContext);
    if (!question && !completionGate(completedContext).complete) {
      return fail(new Error("Completion Gateが未完了のまま最終確認へ進もうとしました。"), retryableOperation("coverage_audit", completedContext, { detailMode }));
    }
    let nextContext = completedContext;
    if (!question) {
      const registration = registerFinalConfirmation(completedContext);
      if (registration.loopDetected) return fail(new Error("同じ内容の最終確認を再表示しようとしたため停止しました。"), null);
      nextContext = { ...registration.context, status: "final_confirmation" };
      logTransition("coverage_audit", "final_confirmation", nextContext, { finalConfirmationFingerprint: registration.fingerprint });
    } else logTransition("coverage_audit", "questioning", nextContext, { decisionDomain: question.question?.decisionDomain ?? question.id });
    const genuineCriticalDecisionDiscovered = (nextContext.criticalDecisionCoverageAudit?.discoveredDecisionDomains?.length ?? 0) > 0
      && nextContext.criticalDecisionCoverageAudit?.complete === false;
    setState((current) => ({ ...current, context: nextContext, question, busy: false, error: "", failedOperation: null, phase: question ? "question" : "review", showWhy: false, displayProgress: monotonicDisplayProgress(current.displayProgress, calculatedConversationProgress(nextContext), genuineCriticalDecisionDiscovered) }));
  };

  async function start() {
    const session = enableCriticalDecisionCoverageAudit(createProjectContext(idea));
    return runAnalysis(session);
  }

  async function runAnalysis(session) {
    showThinking(session);
    try {
      const analysis = await ai.analyzeIdea(session.idea, session.sessionId);
      const analyzed = applyAnalysis(session, analysis);
      return runDimensions(analyzed);
    } catch (error) { fail(error, retryableOperation("analysis", session)); }
  }

  async function runDimensions(analyzed) {
    showThinking(analyzed);
    try {
      const dimensions = await ai.generateDimensions(analyzed);
      const dimensioned = setDimensions(analyzed, dimensions);
      logSessionTrace(dimensioned);
      return advance(dimensioned);
    } catch (error) { fail(error, retryableOperation("dimensions", analyzed)); }
  }

  async function advance(context) {
    const directQuestion = planNext(context, state.detailMode);
    if (directQuestion) return continueWith(context);
    return runInference(context, state.detailMode);
  }

  async function runInference(context, detailMode = state.detailMode) {
    showThinking(context, context.history?.length ?? 1);
    try {
      const inference = await ai.inferMvp(context);
      const inferred = recordInference(context, inference);
      logSessionTrace(inferred);
      const prepared = ensureCompletionQuestion(inferred);
      if (planNext(prepared, detailMode)) return continueWith(prepared, detailMode);
      if (completionGate(prepared).coverageAuditPending) {
        return runCoverageAudit(prepared, detailMode);
      }
      continueWith(prepared, detailMode);
    } catch (error) { fail(error, retryableOperation("inference", context, { detailMode })); }
  }

  async function runCoverageAudit(context, detailMode = state.detailMode) {
    showThinking(context, context.history?.length ?? 1);
    try {
      const audit = await ai.auditCriticalDecisionCoverage(context);
      const audited = applyCriticalDecisionCoverageAudit(context, audit);
      logSessionTrace(audited);
      return continueWith(audited, detailMode);
    } catch (error) { fail(error, retryableOperation("coverage_audit", context, { detailMode })); }
  }

  function retryFailedOperation() {
    const operation = state.failedOperation;
    if (!operation) return;
    if (operation.type === "analysis") return runAnalysis(operation.context);
    if (operation.type === "dimensions") return runDimensions(operation.context);
    if (operation.type === "inference") return runInference(operation.context, operation.detailMode);
    if (operation.type === "coverage_audit") return runCoverageAudit(operation.context, operation.detailMode);
    if (operation.type === "final_coverage_audit") return runFinalCoverageCheck(operation.context);
  }

  async function approveFinalConfirmation() {
    if (!state.context) return;
    const approved = confirmFinalDecisions(state.context);
    logTransition("final_confirmation", "user_confirmed", approved, { confirmedDecisionIds: approved.confirmedFinalDecisions.map((item) => item.id) });
    return runFinalCoverageCheck(approved);
  }

  async function runFinalCoverageCheck(context) {
    const checkingContext = { ...context, status: "final_coverage_check" };
    logTransition("user_confirmed", "final_coverage_check", checkingContext);
    showThinking(checkingContext, checkingContext.history?.length ?? 1);
    try {
      const audit = await ai.auditCriticalDecisionCoverage(checkingContext);
      const audited = applyCriticalDecisionCoverageAudit(checkingContext, audit);
      const newQuestion = planNext(audited, state.detailMode);
      if (newQuestion) {
        logTransition("final_coverage_check", "questioning", audited, { decisionDomain: newQuestion.question?.decisionDomain ?? newQuestion.id });
        return continueWith(audited, state.detailMode);
      }
      if (!completionGate(audited).complete) throw new Error("最終coverage checkが新しい質問も完了判定も返しませんでした。");
      logTransition("final_coverage_check", "spec_generation", audited);
      return generateSpec(audited);
    } catch (error) { fail(error, retryableOperation("final_coverage_audit", checkingContext)); }
  }

  function answer(value, usedRecommendation = false) {
    if (!value?.trim() || !state.context || !state.question) return;
    setFreeAnswer("");
    advance(recordAnswer(state.context, state.question.id, value.trim(), usedRecommendation));
  }

  async function generateSpec(context) {
    if (!context) return;
    if (!completionGate(context).complete) return fail(new Error("最終確認後のCompletion Gateが未完了です。"), retryableOperation("final_coverage_audit", context));
    const generatingContext = { ...context, status: "generating" };
    showThinking(generatingContext, 2);
    try {
      const result = await runSpecRepairPipeline({
        context: generatingContext,
        generateSpec: (context) => ai.generateSpec(context),
        validateRemote: (context, spec) => ai.validateSpec(context, spec),
        onPhase: () => {},
        onDiagnostic: (entries) => console.info("[spec-validation]", entries),
      });
      const markdown = buildMarkdown(result.context, result.spec);
      const completedContext = { ...result.context, generatedSpec: result.spec, validation: result.validation, status: "completed" };
      logSessionTrace(completedContext, { generatedSpec: result.spec, validationErrors: result.validation.issues, repairActions: result.trace.flatMap((step) => step.action ? [step.action] : []), retryCount: Math.max(0, result.trace.length - 1) });
      setState((current) => ({ ...current, context: completedContext, markdown, busy: false, phase: "complete" }));
    } catch (error) {
      const context = error?.context ?? generatingContext;
      const diagnostics = error?.repairTrace ? buildRepairDiagnostics({ context, trace: error.repairTrace, stopMessage: error.message }) : null;
      if (diagnostics) console.info("[spec-validation]", { event: "generation_failed", errorCount: diagnostics.errors.length, diagnostics });
      logSessionTrace(context, { validationErrors: error?.repairTrace?.at(-1)?.revalidationErrors ?? [], repairActions: error?.repairTrace?.map((step) => step.action).filter(Boolean) ?? [], retryCount: Math.max(0, (error?.repairTrace?.length ?? 1) - 1) });
      setState((current) => ({
        ...current,
        context: { ...context, status: "generation_failed", generationFailure: diagnostics },
        question: null,
        busy: false,
        phase: "generation_failed",
        error: error?.message || "SPEC.mdの生成に失敗しました。",
      }));
    }
  }

  function reset() { setIdea(""); setFreeAnswer(""); setState(blank()); }
  function copy(value) { return navigator.clipboard.writeText(value); }
  function download() {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([state.markdown], { type: "text/markdown" }));
    link.download = "SPEC.md";
    link.click();
    URL.revokeObjectURL(link.href);
  }
  const implementationPrompt = `以下の仕様を実装してください。曖昧な箇所はMVPを壊さない最小の判断を行い、完了時にAcceptance Criteriaを検証してください。\n\n${state.markdown}`;
  const question = state.question?.question;

  return <main className="spectaro-shell">
    <div className="spectaro-glow spectaro-glow-a" /><div className="spectaro-glow spectaro-glow-b" />
    <header className="spectaro-header"><button className="brand" onClick={reset} aria-label="ランプのおやじ ネゴシエーターを最初から始める"><span className="brand-mark">🪔</span><span>ランプのおやじ <small>ネゴシエーター</small></span></button>{state.phase !== "start" && <button className="quiet-action" onClick={reset}>最初から</button>}</header>
    {state.context && state.phase !== "complete" && state.phase !== "spec" && <Progress context={state.context} displayProgress={state.displayProgress} />}
    {state.error && state.phase !== "generation_failed" && <aside className="conversation-error" role="alert"><b>AI処理に失敗しました。</b><span>{state.error}</span><button disabled={state.busy} onClick={retryFailedOperation}>もう一度試す</button></aside>}

    <section className="conversation-stage">
      {state.phase === "start" && <div className="start-scene scene-enter"><div className="start-copy"><p className="hero-kicker">あなたの「作りたい！」を、最高のカタチに。</p><h1>ランプのおやじ<br />ネゴシエーター</h1><p>AIが、あなたの願いを聞きながら、実装できる仕様へまとめる相談役。</p></div><GuideAvatar /><div className="speech-bubble start-bubble"><p>ふむ。何を作りたい？<br />まだぼんやりしてても構わないぜ。</p></div><label className="idea-composer"><span className="sr-only">作りたいアプリのアイデア</span><textarea value={idea} onChange={(event) => setIdea(event.target.value)} placeholder="作りたいものを自由に話してくれ&#10;例：自宅の駐車場を使っていない時間だけ他の人に貸せるアプリ" rows="4" /><button disabled={!idea.trim() || state.busy} onClick={start}>おやじに相談する <span>→</span></button></label></div>}

      {state.phase === "thinking" && <div className="thinking-scene scene-enter"><GuideAvatar thinking /><div className="speech-bubble"><p className="thinking-copy">{state.thinkingLine}</p><span>あんたの話を、ちゃんと作れる形に整えてる。</span></div><div className="thinking-dots" aria-label="考え中"><i /><i /><i /></div></div>}

      {state.phase === "question" && state.question && <div className="question-scene scene-enter" key={state.question.id}><section className="question-workspace"><p className="question-count">質問 {state.context.answeredQuestionKeys.length + 1} / {Math.max(state.context.dimensions.length, state.context.answeredQuestionKeys.length + 1)}</p><div className="speech-bubble question-bubble"><p className="bubble-kicker">なるほど……。じゃあ、ここを決めよう。</p><h1>{question?.title ?? state.question.label}</h1><p>{question?.intent}</p><button className="why-link" onClick={() => setState((current) => ({ ...current, showWhy: !current.showWhy }))}>{state.showWhy ? "説明を閉じる" : "なぜ聞くの？"}</button>{state.showWhy && <div className="why-panel">{question?.recommendationReason || "この判断は、アプリの中心的な体験に影響します。"}</div>}</div><div className="answer-stack">{(question?.options ?? []).map((option) => <button className="answer-choice" key={option} onClick={() => answer(option, option === question?.recommended)}><span>{option}</span>{option === question?.recommended && <b>おやじのおすすめ</b>}<i>›</i></button>)}<button className="delegate-choice" onClick={() => answer(question?.recommended, true)}>おやじに任せる</button><div className="free-answer"><label htmlFor="free-answer">その他・自由回答</label><textarea id="free-answer" value={freeAnswer} onChange={(event) => setFreeAnswer(event.target.value)} placeholder="自由に入力" rows="2" /><button disabled={!freeAnswer.trim()} onClick={() => answer(freeAnswer)}>この内容で進む</button></div></div></section><aside className="understanding-panel"><GuideAvatar compact /><h2>現在の理解</h2><p className="understanding-idea">{state.context.analysis?.purpose || state.context.idea}</p><h3>決まっていること</h3><ul>{majorDecisions(state.context).length ? majorDecisions(state.context).slice(-5).map((fact) => <li key={fact.key}>{String(fact.value)}</li>) : <li>話を聞きながら整理中</li>}</ul></aside></div>}

      {state.phase === "review" && <div className="review-scene scene-enter"><GuideAvatar /><div className="speech-bubble review-bubble"><p className="bubble-kicker">見えたぞ。あんたが作りたいのは――</p><h1>{state.context?.analysis?.purpose || state.context?.idea}</h1><p>{state.context?.analysis?.targetUsers ? `${state.context.analysis.targetUsers}のために、${state.context.analysis.purpose}を実現するMVPだな。` : "重要なことはそろった。あとは仕様にまとめるだけだ。"}</p></div><div className="decision-glance">{majorDecisions(state.context).slice(0, 4).map((fact) => <span key={fact.key}>{fact.label ?? fact.key}<b>{String(fact.value)}</b></span>)}</div><div className="confirm-actions"><button className="primary-cta" onClick={approveFinalConfirmation}>その通り！</button><button className="secondary-cta" onClick={() => { setState((current) => ({ ...current, detailMode: true })); continueWith(state.context, true); }}>ちょっと違う</button></div></div>}

      {state.phase === "generation_failed" && <div className="review-scene scene-enter"><GuideAvatar /><div className="speech-bubble review-bubble"><p className="bubble-kicker">回答はそのまま残してある。</p><h1>仕様の最終確認で止まった</h1><p>回答内容は失われていない。SPEC生成だけを、同じ内容でもう一度試せるぞ。</p></div><div className="confirm-actions"><button className="primary-cta" onClick={() => generateSpec(state.context)}>もう一度試す</button><button className="secondary-cta" onClick={reset}>最初からやり直す</button></div><p className="generation-failure-message" role="alert">{state.error}</p></div>}

      {state.phase === "complete" && <div className="complete-scene scene-enter"><GuideAvatar /><div className="speech-bubble"><p className="bubble-kicker">よし、まとまったぜ。</p><h1>交渉成立！</h1><p>具現化度 <strong>100%</strong><br />AIコーディングに渡せるSPEC.mdが完成しました。</p></div><div className="complete-actions"><button className="primary-cta" onClick={() => setState((current) => ({ ...current, phase: "spec" }))}>SPEC.mdを見る</button><button className="secondary-cta" onClick={() => copy(state.markdown)}>SPEC.mdをコピー</button><button className="secondary-cta" onClick={download}>SPEC.mdを保存</button><button className="text-action" onClick={() => copy(implementationPrompt)}>AI実装用プロンプトをコピー</button></div></div>}

      {state.phase === "spec" && <div className="spec-scene scene-enter"><div className="spec-heading"><div><p className="bubble-kicker">完成した仕様</p><h1>SPEC.md</h1></div><div><button className="secondary-cta" onClick={() => copy(state.markdown)}>コピー</button><button className="secondary-cta" onClick={download}>ダウンロード</button><button className="primary-cta" onClick={() => copy(implementationPrompt)}>AI実装用プロンプト</button></div></div><pre>{state.markdown}</pre><button className="text-action" onClick={() => setState((current) => ({ ...current, phase: "complete" }))}>完成画面へ戻る</button></div>}
    </section>
    {counts && state.phase !== "start" && <footer className="conversation-footer">入力から把握 {counts[SOURCE.INITIAL]} ・ あなたが決定 {counts[SOURCE.USER]} ・ AIが補完 {counts[SOURCE.AI]}</footer>}
  </main>;
}

