import '@btw/ui/base.css';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { setupPwa } from './pwa';

setupPwa();
mount(App, { target: document.getElementById('app')! });
