import '@btw/ui/base.css';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { applyFavicons } from './lib/brand';
import { setupPwa } from './pwa/index.svelte';
import PwaBanner from './pwa/PwaBanner.svelte';

applyFavicons();

mount(App, { target: document.getElementById('app')! });
// installable office app + "new version" banner (docs/23 §6), outside the shell
setupPwa();
mount(PwaBanner, { target: document.body.appendChild(document.createElement('div')) });
