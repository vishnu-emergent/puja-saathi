import { createRoot } from 'react-dom/client';
import { Devotee } from './devotee/Devotee';
import { ControlRoom } from './ops/ControlRoom';
import './styles/base.css';
import './styles/devotee.css';
import './styles/ops.css';
import './styles/desktop.css';

const isOps = location.pathname.replace(/\/$/, '') === '/ops';
if (isOps) document.documentElement.classList.add('ops-root');

createRoot(document.getElementById('root')!).render(isOps ? <ControlRoom /> : <Devotee />);
