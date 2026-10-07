import { svg, type SVGTemplateResult } from 'lit'

/*
 * The few Lucide icons the widget needs, copied in rather than added as a
 * dependency. Lucide is ISC licensed: https://lucide.dev/license
 * Drawn at 16px with a 1.5px stroke (non-scaling, so it stays 1.5px).
 */
const icon = (paths: SVGTemplateResult) => svg`
  <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`

export const messageCircle = icon(svg`<path vector-effect="non-scaling-stroke" d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>`)

export const eye = icon(svg`
  <path vector-effect="non-scaling-stroke" d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/>
  <circle vector-effect="non-scaling-stroke" cx="12" cy="12" r="3"/>`)

export const eyeOff = icon(svg`
  <path vector-effect="non-scaling-stroke" d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/>
  <path vector-effect="non-scaling-stroke" d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/>
  <path vector-effect="non-scaling-stroke" d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/>
  <path vector-effect="non-scaling-stroke" d="m2 2 20 20"/>`)

export const list = icon(svg`
  <path vector-effect="non-scaling-stroke" d="M3 12h.01"/><path vector-effect="non-scaling-stroke" d="M3 18h.01"/>
  <path vector-effect="non-scaling-stroke" d="M3 6h.01"/><path vector-effect="non-scaling-stroke" d="M8 12h13"/>
  <path vector-effect="non-scaling-stroke" d="M8 18h13"/><path vector-effect="non-scaling-stroke" d="M8 6h13"/>`)

export const arrowUp = icon(svg`
  <path vector-effect="non-scaling-stroke" d="m5 12 7-7 7 7"/><path vector-effect="non-scaling-stroke" d="M12 19V5"/>`)

export const trash = icon(svg`
  <path vector-effect="non-scaling-stroke" d="M3 6h18"/>
  <path vector-effect="non-scaling-stroke" d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
  <path vector-effect="non-scaling-stroke" d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>`)

export const x = icon(svg`<path vector-effect="non-scaling-stroke" d="M18 6 6 18"/><path vector-effect="non-scaling-stroke" d="m6 6 12 12"/>`)
