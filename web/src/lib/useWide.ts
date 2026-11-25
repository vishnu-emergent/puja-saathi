import { useEffect, useState } from 'react';

const QUERY = '(min-width: 1024px)';
const isEmbed = () => document.documentElement.classList.contains('embed') || new URLSearchParams(location.search).get('embed') === '1';

/** True on laptop/desktop viewports (never inside the control-room phone frames). */
export function useWide() {
  const [wide, setWide] = useState(() => !isEmbed() && window.matchMedia(QUERY).matches);
  useEffect(() => {
    if (isEmbed()) return;
    const mq = window.matchMedia(QUERY);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}
