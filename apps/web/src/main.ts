import '@btw/ui/base.css';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { applyFavicons } from './lib/brand';

applyFavicons();

mount(App, { target: document.getElementById('app')! });
