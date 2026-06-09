import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Note: no <StrictMode> — its dev-only double mount/unmount re-creates the
// WebGL context on the same <canvas>, which three.js doesn't love. The twin
// handle's own dispose() still runs on real unmount.
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<App />);
}
