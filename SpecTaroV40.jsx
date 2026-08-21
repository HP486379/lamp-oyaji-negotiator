import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, RotateCcw, HelpCircle, CheckCircle2, Clipboard, Download } from "lucide-react";
import { HttpRequirementsAI } from "./requirements-ai-client";
import {
  SOURCE, applyAnalysis, buildMarkdown, createProjectContext, majorDecisions,
  planNext, readiness, recordAnswer, recordInference, setDimensions, sourceCounts, validateLocally,
} from "./requirements-core";

const blank = () => ({ phase: "start", context: null, question: null, showWhy: false, proposal: null, markdown: "", error: "", detailMode: false, busy: false });
const MAX_REPAIR_ATTEMPTS = 2;

export default function SpecTaroV40({ ai = new HttpRequirementsAI() }) {
  const [idea, setIdea] = useState("");
  const [state, setState] = useState(blank);
  const [freeAnswer, setFreeAnswer] = useState("");
  const counts = useMemo(() => state.context ? sourceCounts(state.context) : null, [state.context]);

  const fail = (error) => setState((old) => ({ ...old, busy: false, error: error?.message || "AIによる仕様分析に失敗しました。再試行してください。" }));
  const nextQuestion = (context, detailMode = state.detailMode) => {
    const question = planNext(context, detailMode);
    setState((old) => ({ ...old, context, question, phase: question ? "qa" : "review", proposal: null, showWhy: false, busy: false }));
  };

  async function start() {
    setState((old) => ({ ...old, busy: true, error: "" }));
    try {
      const session = createProjectContext(idea);
      const analysis = await ai.analyzeIdea(session.idea);
      const context = setDimensions(applyAnalysis(session, analysis), await ai.generateDimensions(applyAnalysis(session, analysis)));
      nextQuestion(context);
    } catch (error) { fail(error); }
  }

  async function advance(context) {
    const question = planNext(context, state.detailMode);
    if (question) return nextQuestion(context);
    setState((old) => ({ ...old, busy: true, error: "" }));
    try {
      const inferred = await ai.inferMvp(context);
      nextQuestion(recordInference(context, inferred.decisions ?? inferred.inferredDecisions ?? {}));
    } catch (error) { fail(error); }
  }

  function submit(value, recommended = false) {
    if (!value.trim() || !state.context || !state.question) return;
    setFreeAnswer("");
    advance(recordAnswer(state.context, state.question.id, value.trim(), recommended));
  }

  async function generate() {
    let context = state.context;
    setState((old) => ({ ...old, busy: true, error: "", phase: "generating" }));
    try {
      // Infer after the final answer so the provider sees all user decisions.
      context = recordInference(context, (await ai.inferMvp(context)).decisions ?? {});
      let spec;
      let validation;
      for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS; attempt += 1) {
        const response = await ai.generateSpec({ ...context, validationIssues: validation?.issues ?? [] });
        spec = response.spec ?? response;
        const local = validateLocally(context, spec);
        const remote = await ai.validateSpec(context, spec);
        validation = { valid: local.valid && remote.valid, issues: [...local.issues, ...(remote.issues ?? [])] };
        if (validation.valid) break;
      }
      if (!validation.valid) throw new Error("仕様の整合性を確認できませんでした。内容を見直して再試行してください。");
      const markdown = buildMarkdown(context, spec);
      setState((old) => ({ ...old, context: { ...context, generatedSpec: spec, validation, status: "completed" }, markdown, phase: "spec", busy: false }));
    } catch (error) { fail(error); }
  }

  function reset() { setIdea(""); setFreeAnswer(""); setState(blank()); }
  function download() {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([state.markdown], { type: "text/markdown" }));
    link.download = "SPEC.md";
    link.click();
    URL.revokeObjectURL(link.href);
  }
  async function copy(text) { await navigator.clipboard.writeText(text); }
  const implPrompt = `以下の仕様を実装してください。曖昧な箇所はMVPを壊さない最小の判断を行い、完了時にAcceptance Criteriaを検証してください。\n\n${state.markdown}`;

  return <div className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-sky-50 text-slate-900">
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-400"><Sparkles className="h-6 w-6" /></div><div><h1 className="text-2xl font-bold">仕様太郎 v4.0</h1><p className="text-sm text-slate-500">少ない質問で、実装可能なSPEC.mdへ。</p></div></div>
        <Button variant="outline" onClick={reset} className="rounded-2xl"><RotateCcw className="mr-2 h-4 w-4" />最初から</Button>
      </header>

      {state.error && <div className="mb-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{state.error}</div>}
      {state.context && <div className="mb-5 grid gap-3 md:grid-cols-[1fr_260px]"><Card className="rounded-3xl border-0 shadow-sm"><CardContent className="p-4"><div className="mb-2 flex justify-between text-sm"><span className="font-medium">AIコーディング可能性 {readiness(state.context)}%</span><span className="text-slate-500">必要な判断の充足度</span></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-400" style={{ width: `${readiness(state.context)}%` }} /></div></CardContent></Card><Card className="rounded-3xl border-0 shadow-sm"><CardContent className="p-4 text-xs text-slate-500">初期 {counts[SOURCE.INITIAL]} / ユーザー {counts[SOURCE.USER]} / AI補完 {counts[SOURCE.AI]}</CardContent></Card></div>}

      <main className="grid flex-1 place-items-center"><AnimatePresence mode="wait">
        {state.phase === "start" && <motion.div key="start" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-3xl"><Card className="rounded-[2rem] border-0 shadow-xl shadow-amber-100"><CardContent className="p-8 md:p-10"><div className="mb-7 text-center"><p className="mb-2 text-sm font-medium text-amber-600">汎用要件定義エージェント</p><h2 className="text-3xl font-bold md:text-4xl">どんなアプリを作りたいですか？</h2></div><Textarea className="min-h-36 rounded-3xl text-base" placeholder="作りたいアプリやゲームを自然な言葉で入力してください" value={idea} onChange={(e) => setIdea(e.target.value)} /><Button disabled={!idea.trim() || state.busy} onClick={start} className="mt-5 h-12 w-full rounded-2xl text-base">{state.busy ? "分析中…" : "要件定義を始める"}</Button></CardContent></Card></motion.div>}

        {state.phase === "qa" && state.question && <motion.div key={state.question.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-3xl"><Card className="rounded-[2rem] border-0 shadow-xl shadow-sky-100"><CardContent className="p-8 md:p-10"><div className="mb-5 flex justify-between gap-4"><div><p className="mb-2 text-sm font-semibold text-sky-600">必要な判断だけを質問します</p><h2 className="text-2xl font-bold md:text-3xl">{state.question.question?.title ?? state.question.label}</h2><p className="mt-3 text-sm text-slate-500">{state.question.question?.intent}</p></div><Button variant="outline" className="rounded-2xl" onClick={() => setState((old) => ({ ...old, showWhy: !old.showWhy }))}><HelpCircle className="mr-2 h-4 w-4" />なぜ？</Button></div>
          {state.showWhy && <div className="mb-5 rounded-3xl bg-sky-50 p-4 text-sm text-slate-700">{state.question.question?.recommendationReason ?? "この判断はMVPの実装方法と体験に大きく影響します。"}</div>}
          {state.proposal ? <div className="rounded-3xl bg-amber-50 p-5"><p className="mb-2 text-sm font-semibold text-amber-700">AIの提案</p><h3 className="text-xl font-bold">{state.proposal}</h3><p className="mt-2 text-slate-700">{state.question.question?.recommendationReason}</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><Button className="rounded-2xl" onClick={() => submit(state.proposal, true)}>この案を採用する</Button><Button variant="outline" className="rounded-2xl" onClick={() => setState((old) => ({ ...old, proposal: null }))}>自分で選ぶ</Button></div></div> : <><div className="grid gap-3">{(state.question.question?.options ?? []).map((option) => <button key={option} onClick={() => option === "AIにおまかせ" ? setState((old) => ({ ...old, proposal: state.question.question?.recommended })) : submit(option, option === state.question.question?.recommended)} className="rounded-3xl border bg-white p-4 text-left shadow-sm transition hover:border-amber-300"><span className="font-medium">{option}</span>{option === state.question.question?.recommended && <span className="ml-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">AI推奨</span>}</button>)}</div><div className="mt-5 rounded-3xl bg-slate-50 p-4"><p className="mb-2 text-sm font-semibold">その他・自由回答</p><Textarea className="min-h-24 rounded-2xl bg-white" value={freeAnswer} onChange={(e) => setFreeAnswer(e.target.value)} /><div className="mt-3 flex justify-end"><Button disabled={!freeAnswer.trim() || state.busy} onClick={() => submit(freeAnswer)}>回答する</Button></div></div></>}</CardContent></Card></motion.div>}

        {state.phase === "review" && <motion.div key="review" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-3xl"><Card className="rounded-[2rem] border-0 shadow-xl shadow-green-100"><CardContent className="p-8 md:p-10"><div className="mb-5 text-center"><CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-green-500" /><h2 className="text-3xl font-bold">主要な判断がそろいました</h2></div><ul className="rounded-3xl bg-slate-50 p-5 text-sm">{majorDecisions(state.context).map((fact, index) => <li key={`${fact.key}-${index}`} className="mb-2 rounded-2xl bg-white px-4 py-2">{fact.key}: {String(fact.value)}</li>)}</ul><div className="mt-5 grid gap-3 sm:grid-cols-2"><Button disabled={state.busy} onClick={generate} className="h-12 rounded-2xl text-base">{state.busy ? "SPECを生成中…" : "SPEC.mdを作る"}</Button><Button variant="outline" disabled={state.busy} onClick={() => nextQuestion(state.context, true)} className="h-12 rounded-2xl text-base">もう少し自分で決める</Button></div></CardContent></Card></motion.div>}

        {state.phase === "spec" && <motion.div key="spec" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full"><Card className="rounded-[2rem] border-0 shadow-xl"><CardContent className="p-5 md:p-7"><div className="mb-4 flex flex-col justify-between gap-3 md:flex-row"><div><h2 className="text-2xl font-bold">SPEC.md</h2><p className="text-sm text-slate-500">検証済みのMVP仕様です。</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => copy(state.markdown)}><Clipboard className="mr-2 h-4 w-4" />Markdownをコピー</Button><Button variant="outline" onClick={download}><Download className="mr-2 h-4 w-4" />.md保存</Button><Button onClick={() => copy(implPrompt)}>AI実装用プロンプト</Button></div></div><pre className="max-h-[62vh] overflow-auto rounded-3xl bg-slate-950 p-5 text-sm leading-6 text-slate-50 whitespace-pre-wrap">{state.markdown}</pre></CardContent></Card></motion.div>}
      </AnimatePresence></main>
    </div>
  </div>;
}
