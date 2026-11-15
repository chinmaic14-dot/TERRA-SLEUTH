import React, { useEffect, useRef, useState } from 'react';
import {
  Languages,
  Loader2,
  Mic,
  MicOff,
  Send,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import { SUPPORTED_LANGUAGES, useLanguage } from '../context/LanguageContext';
import { InvestigationSummary, PageId } from '../types/terra';

interface VoiceAssistantProps {
  activePage: PageId;
  activeInvestigation: InvestigationSummary | null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  languageName: string;
}

export const VoiceAssistant: React.FC<VoiceAssistantProps> = ({
  activePage,
  activeInvestigation,
}) => {
  const { language, setLanguageCode, voiceOpen, setVoiceOpen } = useLanguage();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  };

  useEffect(() => {
    return () => {
      stopAudio();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const speakWithBrowserFallback = (text: string, locale: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = locale;
    const voices = window.speechSynthesis.getVoices();
    const matched = voices.find((v) => v.lang.toLowerCase().startsWith(locale.split('-')[0].toLowerCase()));
    if (matched) utter.voice = matched;
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  };

  const speakText = async (text: string) => {
    if (!text.trim()) return;
    stopAudio();
    setSpeaking(true);
    try {
      const res = await fetch('/api/assistant/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.slice(0, 1200),
          languageName: language.name,
        }),
      });
      const json = await res.json();
      if (res.ok && json.ok && json.audioBase64) {
        const audio = new Audio(`data:${json.mimeType || 'audio/wav'};base64,${json.audioBase64}`);
        audioRef.current = audio;
        audio.onended = () => setSpeaking(false);
        audio.onerror = () => speakWithBrowserFallback(text, language.speechLocale);
        await audio.play();
        return;
      }
    } catch {
      // Fallback to browser SpeechSynthesis
    }
    speakWithBrowserFallback(text, language.speechLocale);
  };

  const collectVisibleContext = () => {
    const mainText = document.querySelector('main')?.innerText ?? '';
    return mainText.replace(/\s+/g, ' ').trim().slice(0, 3200);
  };

  const buildInvestigationSummary = () => {
    if (!activeInvestigation) return 'No active investigation selected.';
    return `${activeInvestigation.region_name} (${activeInvestigation.state}, ${activeInvestigation.country}) | Category: ${activeInvestigation.category} | Verdict: ${activeInvestigation.verdict ?? activeInvestigation.status} | Question: ${activeInvestigation.research_question}`;
  };

  const askAssistant = async (questionText: string) => {
    const q = questionText.trim();
    if (!q || busy) return;
    setInput('');
    setStatusNote(null);
    setMessages((prev) => [...prev, { role: 'user', text: q, languageName: language.name }]);
    setBusy(true);

    try {
      const res = await fetch('/api/assistant/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          languageName: language.name,
          activePage,
          investigationSummary: buildInvestigationSummary(),
          pageContextText: collectVisibleContext(),
        }),
      });
      const json = await res.json();
      const reply = json.reply || json.error || 'No response available.';
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: reply, languageName: language.name },
      ]);
      void speakText(reply);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: errMsg, languageName: language.name },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const handleReadPageAloud = async () => {
    if (busy) return;
    setStatusNote(null);
    setBusy(true);
    try {
      const visible = collectVisibleContext();
      const baseSummary = visible
        ? `Page: ${activePage}. ${buildInvestigationSummary()}. Key content: ${visible.slice(0, 1800)}`
        : `${activePage}. ${buildInvestigationSummary()}`;

      let spokenText = baseSummary;
      if (language.code !== 'en') {
        const trRes = await fetch('/api/assistant/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: baseSummary, languageName: language.name }),
        });
        const trJson = await trRes.json();
        if (trJson?.translatedText) spokenText = trJson.translatedText;
      } else {
        const askRes = await fetch('/api/assistant/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: 'Give a crisp spoken summary of the key findings or options currently shown on this page.',
            languageName: language.name,
            activePage,
            investigationSummary: buildInvestigationSummary(),
            pageContextText: visible,
          }),
        });
        const askJson = await askRes.json();
        if (askJson?.reply) spokenText = askJson.reply;
      }

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: spokenText, languageName: language.name },
      ]);
      void speakText(spokenText);
    } finally {
      setBusy(false);
    }
  };

  const toggleMicrophone = async () => {
    if (listening) {
      setListening(false);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      return;
    }

    setStatusNote(null);
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRec) {
      try {
        const rec = new SpeechRec();
        recognitionRef.current = rec;
        rec.lang = language.speechLocale;
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        rec.onstart = () => setListening(true);
        rec.onresult = (ev: any) => {
          const transcript = ev.results?.[0]?.[0]?.transcript ?? '';
          setListening(false);
          if (transcript.trim()) {
            void askAssistant(transcript);
          }
        };
        rec.onerror = () => {
          setListening(false);
          setStatusNote(`Microphone voice capture stopped (${language.nativeLabel}). You can type below.`);
        };
        rec.onend = () => setListening(false);
        rec.start();
        return;
      } catch {
        // Fallback to MediaRecorder
      }
    }

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          setListening(false);
          const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          const buf = await blob.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          const audioBase64 = btoa(binary);
          setBusy(true);
          try {
            const trRes = await fetch('/api/assistant/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64,
                mimeType: blob.type || 'audio/webm',
                languageName: language.name,
              }),
            });
            const trJson = await trRes.json();
            if (trJson?.text) {
              setBusy(false);
              void askAssistant(trJson.text);
            } else {
              setStatusNote('Could not transcribe audio. Please type your question.');
              setBusy(false);
            }
          } catch {
            setStatusNote('Audio transcription unavailable. Please type your question.');
            setBusy(false);
          }
        };
        setListening(true);
        recorder.start();
      } catch {
        setStatusNote('Microphone permission unavailable in this browser. Type your question below.');
      }
    } else {
      setStatusNote('Microphone input is not supported in this browser. Type your question below.');
    }
  };

  return (
    <>
      {!voiceOpen && (
        <button
          onClick={() => setVoiceOpen(true)}
          aria-label="Open Multilingual Voice Assistant"
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#35C99A] text-[#07120F] font-semibold text-xs shadow-lg shadow-black/40 hover:bg-[#2eb58a] transition-colors"
        >
          <Volume2 className="w-4 h-4" />
          <span>Voice Assistant · {language.code.toUpperCase()}</span>
        </button>
      )}

      {voiceOpen && (
        <aside
          aria-label="Multilingual Voice Assistant"
          className="fixed bottom-5 right-5 z-50 w-[360px] max-w-[calc(100vw-2rem)] bg-[#0B1C17] border border-[#35C99A]/40 rounded-2xl shadow-2xl shadow-black/70 flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="px-4 py-3 bg-[#10251E] border-b border-[#9DB2A7]/15 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Volume2 className="w-4 h-4 text-[#35C99A] shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#E8F2ED] truncate">
                  TERRA SLEUTH Voice Assistant
                </div>
                <div className="text-[10px] font-mono text-[#65B8D5] truncate">
                  {language.nativeLabel} · Page: {activePage}
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                stopAudio();
                setVoiceOpen(false);
              }}
              aria-label="Close Voice Assistant"
              className="p-1 rounded text-[#9DB2A7] hover:text-[#E8F2ED]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Language Selector + Page Readout Controls */}
          <div className="p-3 bg-[#07120F]/60 border-b border-[#9DB2A7]/10 space-y-2 text-xs">
            <div className="flex items-center gap-2" data-no-translate="true">
              <Languages className="w-3.5 h-3.5 text-[#35C99A] shrink-0" />
              <select
                aria-label="Voice Assistant Language"
                value={language.code}
                onChange={(e) => setLanguageCode(e.target.value)}
                className="flex-1 bg-[#10251E] border border-[#9DB2A7]/25 rounded-lg px-2.5 py-1.5 text-xs text-[#E8F2ED] focus:outline-none focus:border-[#35C99A]"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.nativeLabel}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReadPageAloud}
                disabled={busy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10251E] border border-[#35C99A]/35 text-[#35C99A] hover:bg-[#35C99A]/10 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />}
                Read &amp; Summarize Page ({language.name})
              </button>
              {speaking && (
                <button
                  onClick={stopAudio}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300"
                >
                  <Square className="w-3 h-3" /> Stop
                </button>
              )}
            </div>
          </div>

          {/* Conversation History */}
          <div className="p-3 max-h-60 overflow-y-auto space-y-2.5 text-xs">
            {messages.length === 0 ? (
              <div className="text-[#9DB2A7] leading-relaxed">
                Ask any question by voice or text in <strong className="text-[#E8F2ED]">{language.nativeLabel}</strong>, or tap <strong className="text-[#35C99A]">Read &amp; Summarize Page</strong> to hear current satellite results and solutions spoken aloud.
              </div>
            ) : (
              messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`p-2.5 rounded-lg leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-[#35C99A]/15 border border-[#35C99A]/30 text-[#E8F2ED] ml-6'
                      : 'bg-[#10251E] border border-[#9DB2A7]/15 text-[#E8F2ED] mr-4'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1 text-[10px] font-mono text-[#9DB2A7]" data-no-translate="true">
                    <span>{m.role === 'user' ? 'You' : `Assistant (${m.languageName})`}</span>
                    {m.role === 'assistant' && (
                      <button
                        onClick={() => void speakText(m.text)}
                        className="text-[#35C99A] hover:underline inline-flex items-center gap-1"
                      >
                        <Volume2 className="w-3 h-3" /> Speak
                      </button>
                    )}
                  </div>
                  <div data-no-translate="true">{m.text}</div>
                </div>
              ))
            )}
            {statusNote && <div className="text-[11px] text-[#B58C5A]">{statusNote}</div>}
          </div>

          {/* Voice + Text Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void askAssistant(input);
            }}
            className="p-2.5 border-t border-[#9DB2A7]/15 bg-[#10251E] flex items-center gap-2"
          >
            <button
              type="button"
              onClick={() => void toggleMicrophone()}
              aria-label={listening ? 'Stop voice recording' : 'Start voice input'}
              className={`p-2 rounded-lg border transition-colors shrink-0 ${
                listening
                  ? 'bg-rose-500/20 border-rose-400 text-rose-300 animate-pulse'
                  : 'bg-[#0B1C17] border-[#9DB2A7]/25 text-[#35C99A] hover:border-[#35C99A]'
              }`}
            >
              {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask in ${language.name}…`}
              className="flex-1 min-w-0 bg-[#0B1C17] border border-[#9DB2A7]/20 rounded-lg px-3 py-1.5 text-xs text-[#E8F2ED] focus:outline-none focus:border-[#35C99A]"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send voice assistant question"
              className="p-2 rounded-lg bg-[#35C99A] text-[#07120F] hover:bg-[#2eb58a] disabled:opacity-50 shrink-0"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </aside>
      )}
    </>
  );
};
