/* Interview Copilot — thu âm thanh từ 1 MediaStream, tự cắt câu theo khoảng lặng (VAD), xuất WAV 16 kHz */
(function (MD) {
  'use strict';
  const AU = {};
  const TARGET_RATE = 16000;

  /* opts: onSegment({b64, mime, start, end, durMs}), onLevel(0..1), onSpeaking(bool),
           silenceMs (mặc định 900), maxMs (15000), minVoiceMs (450), sensitivity (1..5, mặc định 3) */
  AU.listen = (stream, opts = {}) => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const mute = ctx.createGain(); mute.gain.value = 0; // phải nối ra destination để xử lý chạy, nhưng không phát lại
    src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
    const rate = ctx.sampleRate, frameMs = 4096 / rate * 1000;
    let noise = 0.004, speaking = false, silenceFor = 0, voiceMs = 0, segStart = 0;
    let chunks = [], pre = [];
    const PRE_FRAMES = Math.ceil(300 / frameMs);
    const cfg = () => ({ silenceMs: opts.silenceMs || 900, maxMs: opts.maxMs || 15000, minVoiceMs: opts.minVoiceMs || 450, k: [0, 4.5, 3.5, 2.6, 2, 1.6][opts.sensitivity || 3] });

    proc.onaudioprocess = (e) => {
      const data = new Float32Array(e.inputBuffer.getChannelData(0));
      let sum = 0; for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      const c = cfg();
      const thr = Math.max(0.006, noise * c.k);
      const voiced = rms > thr;
      if (!speaking && !voiced) noise = noise * 0.97 + rms * 0.03; // học tiếng ồn nền khi im lặng
      opts.onLevel && opts.onLevel(Math.min(1, rms / 0.12));
      if (voiced) {
        if (!speaking) { speaking = true; segStart = Date.now() - pre.length * frameMs; chunks = pre.slice(); voiceMs = 0; opts.onSpeaking && opts.onSpeaking(true); }
        silenceFor = 0; voiceMs += frameMs;
      } else if (speaking) silenceFor += frameMs;
      if (speaking) {
        chunks.push(data);
        const dur = chunks.length * frameMs;
        if (silenceFor >= c.silenceMs || dur >= c.maxMs) {
          const seg = chunks; chunks = []; speaking = false;
          const reason = silenceFor >= c.silenceMs ? 'silence' : 'max'; silenceFor = 0;
          opts.onSpeaking && opts.onSpeaking(false);
          if (voiceMs >= c.minVoiceMs) emit(seg, segStart, Date.now(), reason, voiceMs);
        }
      } else {
        pre.push(data); if (pre.length > PRE_FRAMES) pre.shift();
      }
    };

    // reason: 'silence' (người nói ngừng) | 'max' (câu quá dài, cắt giữa chừng) | 'flush' (bấm tay)
    function emit(seg, start, end, reason, voiced) {
      const len = seg.reduce((s, a) => s + a.length, 0);
      const all = new Float32Array(len); let o = 0; seg.forEach((a) => { all.set(a, o); o += a.length; });
      const pcm = downsample(all, rate, TARGET_RATE);
      opts.onSegment && opts.onSegment({ b64: wavBase64(pcm, TARGET_RATE), mime: 'audio/wav', start, end, durMs: end - start, reason: reason || 'flush', voiceMs: voiced || 0 });
    }

    return {
      ctx,
      setOpts: (o) => Object.assign(opts, o),
      // ép kết thúc câu đang nói (vd khi bấm "Gợi ý ngay")
      flush: () => { if (speaking && chunks.length) { const seg = chunks; chunks = []; speaking = false; if (voiceMs >= cfg().minVoiceMs) emit(seg, segStart, Date.now(), 'flush', voiceMs); } },
      stop: () => { try { proc.disconnect(); src.disconnect(); mute.disconnect(); ctx.close(); } catch (e) { /* bỏ qua */ } }
    };
  };

  function downsample(buf, from, to) {
    if (from === to) return buf;
    const ratio = from / to, n = Math.floor(buf.length / ratio), out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * ratio), b = Math.min(buf.length, Math.floor((i + 1) * ratio));
      let s = 0; for (let j = a; j < b; j++) s += buf[j];
      out[i] = s / Math.max(1, b - a);
    }
    return out;
  }

  function wavBase64(f32, rate) {
    const buf = new ArrayBuffer(44 + f32.length * 2), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + f32.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, f32.length * 2, true);
    for (let i = 0; i < f32.length; i++) { const x = Math.max(-1, Math.min(1, f32[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
    const bytes = new Uint8Array(buf); let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  /* Chụp 1 khung hình từ luồng video (tab Meet) -> JPEG base64 */
  AU.grabFrame = async (videoEl, maxW = 1280) => {
    if (!videoEl || !videoEl.videoWidth) throw new Error('Chưa có hình ảnh màn hình.');
    const s = Math.min(1, maxW / videoEl.videoWidth);
    const c = document.createElement('canvas'); c.width = Math.round(videoEl.videoWidth * s); c.height = Math.round(videoEl.videoHeight * s);
    c.getContext('2d').drawImage(videoEl, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', 0.8);
    return { b64: url.split(',')[1], mime: 'image/jpeg', url };
  };

  MD.Audio = AU;
})(window.MD = window.MD || {});
