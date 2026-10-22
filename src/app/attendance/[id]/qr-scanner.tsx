'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PrimaryButton, SecondaryButton } from '@/components/cis/button';
import { FieldError } from '@/components/cis/form';
import { SheetHeading } from '@/components/cis/sheet';
import { AttendanceSheet } from '../parts';
import { scanAttendance } from '../actions';

export function AttendanceQrScanner({ dayId }: { dayId: string }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let stream: MediaStream | undefined;
    let controls: { stop: () => void } | undefined;
    let saving = false;
    let lastCode = '';
    let lastTime = 0;
    const hide = () => { if (document.hidden) setActive(false); };
    document.addEventListener('visibilitychange', hide);
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access requires HTTPS and a supported browser. You can still mark attendance manually.');
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        if (cancelled) return;
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        setMessage('Camera ready. Hold one QR code inside the camera view.');
        controls = await new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250, delayBetweenScanSuccess: 500 })
          .decodeFromStream(stream, video.current!, async (result) => {
            if (cancelled || saving || !result) return;
            const code = result.getText();
            if (code === lastCode && Date.now() - lastTime < 3000) return;
            lastCode = code; lastTime = Date.now(); saving = true;
            setError(''); setMessage('Saving attendance…');
            try {
              const saved = await scanAttendance({ dayId, code });
              if (cancelled) return;
              if (saved.ok) { setMessage(saved.message); router.refresh(); }
              else { setMessage(''); setError(saved.error); }
            } catch {
              if (!cancelled) { setMessage(''); setError('Could not save. Check your connection and scan again.'); }
            } finally { saving = false; }
          });
        if (cancelled) controls.stop();
      } catch (error) {
        stream?.getTracks().forEach((track) => track.stop());
        if (!cancelled) {
          setActive(false); setMessage('');
          setError(error instanceof Error && error.name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow camera access in your browser settings, then try again.'
            : error instanceof Error && error.name === 'NotFoundError'
              ? 'No camera was found. Connect a camera or use manual attendance.'
              : 'Could not start the camera. Use HTTPS, check camera permissions, and close other apps using the camera. Manual attendance is still available.');
        }
      }
    };
    void start();
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', hide);
      controls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [active, dayId, router]);

  return <AttendanceSheet>
    <SheetHeading>Scan attendance</SheetHeading>
    <p>Scanning marks a kid present for this day, across your accessible teams. Existing present or late marks are kept.</p>
    {active
      ? <SecondaryButton onClick={() => { setActive(false); setMessage('Camera stopped.'); }}>Stop camera</SecondaryButton>
      : <PrimaryButton onClick={() => { setError(''); setMessage('Starting camera…'); setActive(true); }}>Start camera</PrimaryButton>}
    <video ref={video} hidden={!active} muted playsInline aria-label="Attendance QR camera" className="w-full rounded-cis-chip" />
    <p role="status" aria-live="polite" className="font-bold">{message}</p>
    {error && <FieldError>{error}</FieldError>}
  </AttendanceSheet>;
}
