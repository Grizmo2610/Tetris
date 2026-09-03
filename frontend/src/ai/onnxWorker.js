// onnxWorker.js — runs inside a Web Worker
// Receives:  { type: 'INIT', modelBuffer: ArrayBuffer }
//            { type: 'INFER', requestId: string, state: Float32Array }
// Sends:     { type: 'READY' }
//            { type: 'RESULT', requestId, action: number }
//            { type: 'ERROR', message: string }

importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/ort.min.js');

let session = null;

self.onmessage = async ({ data }) => {
  if (data.type === 'INIT') {
    try {
      // Configure ONNX Runtime to use WASM backend
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;

      session = await ort.InferenceSession.create(data.modelBuffer, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });

      self.postMessage({ type: 'READY' });
    } catch (err) {
      self.postMessage({ type: 'ERROR', message: `ONNX init failed: ${err.message}` });
    }
    return;
  }

  if (data.type === 'INFER') {
    const { requestId, state } = data;
    if (!session) {
      self.postMessage({ type: 'ERROR', message: 'Session not initialized', requestId });
      return;
    }
    try {
      const inputTensor = new ort.Tensor('float32', state, [1, state.length]);
      const feeds = { state: inputTensor };
      const results = await session.run(feeds);

      // Output tensor name may vary by model export; try common names
      const outputName = Object.keys(results)[0];
      const qValues = results[outputName].data; // Float32Array of length 40

      // Find argmax (valid actions should be pre-masked by caller)
      let bestAction = 0;
      let bestQ = -Infinity;
      for (let i = 0; i < qValues.length; i++) {
        if (qValues[i] > bestQ) { bestQ = qValues[i]; bestAction = i; }
      }

      self.postMessage({ type: 'RESULT', requestId, action: bestAction });
    } catch (err) {
      self.postMessage({ type: 'ERROR', message: `Inference failed: ${err.message}`, requestId });
    }
  }
};
