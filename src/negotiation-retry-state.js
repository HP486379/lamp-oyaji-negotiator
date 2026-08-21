export function processingFailureState(current, error, failedOperation) {
  const context = failedOperation?.context ?? current.context;
  return {
    ...current,
    context,
    question: null,
    busy: false,
    error: error?.message || "AI処理に失敗しました。もう一度試してください。",
    phase: "thinking",
    failedOperation,
    thinkingLine: "途中で止まったが、ここまでの話は残してある。",
  };
}

export function retryableOperation(type, context, extra = {}) {
  return { type, context, ...extra };
}
