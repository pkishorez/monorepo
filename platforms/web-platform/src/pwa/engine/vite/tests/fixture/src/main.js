import './style.css';
import info from 'virtual:pwa-toolkit/client';
import logo from './logo.png';

document.body.dataset.pwa = JSON.stringify(info);
document.body.style.backgroundImage = `url(${logo})`;
