import { useEffect, useRef, useState } from 'react';

type Recognition = { lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number; start: () => void; abort: () => void; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null };
type RecognitionConstructor = new () => Recognition;

const normalize = (value: string) => {
  const digits: Record<string, string> = { zero:'0',oh:'0',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9' };
  return value.toLowerCase().replace(/\b(?:dash|hyphen|minus)\b/gu, '-').replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/gu, (word) => digits[word]).replace(/\s*[-]\s*/gu, '-').replace(/\s+/gu, '').toUpperCase();
};

export function useCatalogNumberVoice(active: boolean, onValue: (value: string) => void) {
  const [status, setStatus] = useState('');
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<Recognition | null>(null);

  const stop = () => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null; setListening(false);
    if (recognition) { try { recognition.abort(); } catch { /* already finished */ } }
  };
  const start = () => {
    const voiceWindow = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Constructor = voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition;
    if (!Constructor) { setStatus('Voice entry is not available in this browser. Try Chrome or Safari with microphone permission enabled.'); return; }
    recognitionRef.current?.abort();
    const recognition = new Constructor(); recognitionRef.current = recognition;
    recognition.lang='en-US'; recognition.continuous=false; recognition.interimResults=false; recognition.maxAlternatives=1;
    recognition.onresult = (event) => { const value = normalize(event.results[0]?.[0]?.transcript || ''); if (!value) { setStatus('No catalog number was heard. Please try again.'); return; } onValue(value); setStatus(`Heard: ${value}`); };
    recognition.onerror = (event) => setStatus(event.error === 'not-allowed' ? 'Microphone permission was not granted.' : `Voice entry could not start (${event.error}).`);
    recognition.onend = () => { setListening(false); recognitionRef.current = null; };
    setListening(true); setStatus('Listening for a catalog number...');
    try { recognition.start(); } catch { setListening(false); recognitionRef.current=null; setStatus('Voice entry is already active or could not start. Please try again.'); }
  };
  useEffect(() => { if (!active) stop(); }, [active]);
  useEffect(() => () => stop(), []);
  return { status, listening, start, stop };
}
