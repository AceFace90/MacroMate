import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

// Inline SVG icons drawn to echo the SF Symbols used by the native iOS app
// (fork.knife, chart.bar.fill, person.crop.circle, gearshape, barcode.viewfinder, ...).
// Same approach as LabMate's web Icon.tsx. 24×24 grid, filled glyphs unless noted.
// Usage: <Icon name="barcode" size={22} color={theme.accent} />

const G = {
  forkKnife: (c) => (
    <>
      <Path fill={c} d="M5 2.5a1 1 0 0 1 1 1V8h1V3.5a1 1 0 1 1 2 0V8h1V3.5a1 1 0 1 1 2 0V9c0 1.7-1.1 3-2.5 3.4V20.5a1.5 1.5 0 0 1-3 0v-8.1C5.1 12 4 10.7 4 9V3.5a1 1 0 0 1 1-1Z" />
      <Path fill={c} d="M18.5 2.5c.6 0 1 .4 1 1v17a1.5 1.5 0 0 1-3 0V15h-1.2a1 1 0 0 1-1-1.1c.3-4.6 1.3-9.1 3.6-11.1.2-.2.4-.3.6-.3Z" />
    </>
  ),
  chart: (c) => (
    <>
      <Rect fill={c} x="3" y="12" width="4.5" height="9" rx="1.2" />
      <Rect fill={c} x="9.75" y="7" width="4.5" height="14" rx="1.2" />
      <Rect fill={c} x="16.5" y="3" width="4.5" height="18" rx="1.2" />
    </>
  ),
  person: (c) => (
    <Path fill={c} fillRule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 11.5c-2.7 0-5 1.2-6.2 3.1A7.9 7.9 0 0 0 12 20c2.5 0 4.7-1.3 6.2-3.4-1.2-1.9-3.5-3.1-6.2-3.1ZM12 5.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
  ),
  gear: (c) => (
    <Path fill={c} fillRule="evenodd" d="M10.3 2h3.4l.5 2.6c.6.2 1.2.5 1.7.9l2.5-.9 1.7 3-2 1.7a6 6 0 0 1 0 1.8l2 1.7-1.7 3-2.5-.9c-.5.4-1.1.7-1.7.9l-.5 2.6h-3.4l-.5-2.6c-.6-.2-1.2-.5-1.7-.9l-2.5.9-1.7-3 2-1.7a6 6 0 0 1 0-1.8l-2-1.7 1.7-3 2.5.9c.5-.4 1.1-.7 1.7-.9L10.3 2ZM12 8.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" transform="translate(0 0.5)" />
  ),
  plus: (c) => (
    <Path fill={c} d="M12 3.5c.7 0 1.2.5 1.2 1.2v6.1h6.1a1.2 1.2 0 1 1 0 2.4h-6.1v6.1a1.2 1.2 0 1 1-2.4 0v-6.1H4.7a1.2 1.2 0 1 1 0-2.4h6.1V4.7c0-.7.5-1.2 1.2-1.2Z" />
  ),
  barcode: (c) => (
    <>
      <Path fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" />
      <Path fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" d="M7 8v8M10 8v8M13 8v8M17 8v8" />
      <Path fill="none" stroke={c} strokeWidth="1" strokeLinecap="round" d="M15 8v8" />
    </>
  ),
  camera: (c) => (
    <Path fill={c} fillRule="evenodd" d="M9.2 3.5h5.6c.6 0 1.1.3 1.4.8l1 1.7h2.3C21 6 22 7 22 8.5v9c0 1.4-1 2.5-2.5 2.5h-15A2.5 2.5 0 0 1 2 17.5v-9C2 7 3 6 4.5 6h2.3l1-1.7c.3-.5.8-.8 1.4-.8ZM12 8.5a4.3 4.3 0 1 0 0 8.6 4.3 4.3 0 0 0 0-8.6Z" />
  ),
  label: (c) => (
    <>
      <Path fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" />
      <Path fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" d="M7.5 8.5h9M7.5 12h9M7.5 15.5h5" />
    </>
  ),
  sparkles: (c) => (
    <>
      <Path fill={c} d="M10 3c.4 0 .7.3.8.6l1 3.4c.3 1 1.1 1.9 2.2 2.2l3.4 1c.3.1.6.4.6.8s-.3.7-.6.8l-3.4 1c-1 .3-1.9 1.1-2.2 2.2l-1 3.4c-.1.3-.4.6-.8.6s-.7-.3-.8-.6l-1-3.4c-.3-1-1.1-1.9-2.2-2.2l-3.4-1C2.3 11.7 2 11.4 2 11s.3-.7.6-.8l3.4-1c1-.3 1.9-1.1 2.2-2.2l1-3.4c.1-.3.4-.6.8-.6Z" />
      <Path fill={c} d="M18 1.5c.3 0 .5.2.6.4l.4 1.3c.1.4.4.7.8.8l1.3.4c.3.1.4.3.4.6s-.2.5-.4.6l-1.3.4c-.4.1-.7.4-.8.8l-.4 1.3c-.1.3-.3.4-.6.4s-.5-.2-.6-.4l-.4-1.3a1.2 1.2 0 0 0-.8-.8l-1.3-.4c-.3-.1-.4-.3-.4-.6s.2-.5.4-.6l1.3-.4c.4-.1.7-.4.8-.8l.4-1.3c.1-.3.3-.4.6-.4Z" />
    </>
  ),
  search: (c) => (
    <Path fill={c} fillRule="evenodd" d="M10.5 3a7.5 7.5 0 0 1 6 12l4.3 4.3a1.1 1.1 0 0 1-1.6 1.6L15 16.6A7.5 7.5 0 1 1 10.5 3Zm0 2.2a5.3 5.3 0 1 0 0 10.6 5.3 5.3 0 0 0 0-10.6Z" />
  ),
  chevronLeft: (c) => (
    <Path fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" d="M15 4.5 7.5 12l7.5 7.5" />
  ),
  chevronRight: (c) => (
    <Path fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" d="m9 4.5 7.5 7.5L9 19.5" />
  ),
  chevronDown: (c) => (
    <Path fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" d="m4.5 9 7.5 7.5L19.5 9" />
  ),
  close: (c) => (
    <Path fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
  ),
  check: (c) => (
    <Path fill="none" stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.5 5 5L19.5 7" />
  ),
  trash: (c) => (
    <Path fill={c} d="M9.5 2h5c.8 0 1.5.7 1.5 1.5v1h4a1 1 0 1 1 0 2h-.9l-.9 13.1c-.1 1.6-1.4 2.9-3 2.9H8.8c-1.6 0-2.9-1.3-3-2.9L4.9 6.5H4a1 1 0 0 1 0-2h4v-1C8 2.7 8.7 2 9.5 2Zm.5 7a1 1 0 0 0-1 1v7a1 1 0 1 0 2 0v-7a1 1 0 0 0-1-1Zm4 0a1 1 0 0 0-1 1v7a1 1 0 1 0 2 0v-7a1 1 0 0 0-1-1Z" />
  ),
  clock: (c) => (
    <Path fill={c} fillRule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 4a1 1 0 0 0-1 1v5c0 .3.1.5.3.7l3 3a1 1 0 0 0 1.4-1.4L13 11.6V7a1 1 0 0 0-1-1Z" />
  ),
  flame: (c) => (
    <Path fill={c} d="M12.6 2.2c.3-.2.7-.2 1 0 3.6 2.6 6.4 6.6 6.4 11a8 8 0 0 1-16 0c0-2.4 1-4.6 2.6-6.3.3-.3.8-.4 1.2-.2.4.2.6.6.5 1-.1.5-.1 1-.1 1.5 0 1.4.8 2.6 2 3.1-.6-3.4.5-7.1 2.4-10.1Z" />
  ),
  scale: (c) => (
    <Path fill={c} fillRule="evenodd" d="M6.5 3h11A3.5 3.5 0 0 1 21 6.5v11a3.5 3.5 0 0 1-3.5 3.5h-11A3.5 3.5 0 0 1 3 17.5v-11A3.5 3.5 0 0 1 6.5 3ZM12 6c-2.3 0-4.4.9-5.9 2.4l2.6 3a4.6 4.6 0 0 1 2.4-1.2l.6-2.1a.5.5 0 0 1 1 .3l-.6 1.8c1 .2 1.9.6 2.6 1.2l2.6-3A8.3 8.3 0 0 0 12 6Z" />
  ),
  sun: (c) => (
    <>
      <Circle fill={c} cx="12" cy="12" r="4.5" />
      <Path fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  moon: (c) => (
    <Path fill={c} d="M10.2 2.3c.3.3.4.8.2 1.2A7.5 7.5 0 0 0 20.5 13.6c.4-.2.9-.1 1.2.2.3.3.4.8.2 1.2A10 10 0 1 1 9 2.1c.4-.2.9-.1 1.2.2Z" />
  ),
  phone: (c) => (
    <Path fill={c} d="M8 1.5h8c1.7 0 3 1.3 3 3v15c0 1.7-1.3 3-3 3H8a3 3 0 0 1-3-3v-15c0-1.7 1.3-3 3-3Zm2 2.5a.8.8 0 0 0 0 1.5h4a.8.8 0 0 0 0-1.5h-4Z" />
  ),
  cloud: (c) => (
    <Path fill={c} d="M12.5 5a6 6 0 0 1 5.8 4.6A4.8 4.8 0 0 1 17.5 19h-11a5 5 0 0 1-.6-10A6 6 0 0 1 12.5 5Z" />
  ),
  key: (c) => (
    <Path fill={c} fillRule="evenodd" d="M8 6a6 6 0 0 1 5.7 7.9l7 7a1 1 0 0 1 .3.7V21a1 1 0 0 1-1 1h-2.5a1 1 0 0 1-1-1v-1h-1a1 1 0 0 1-1-1v-1h-1a1 1 0 0 1-.7-.3l-1.9-1.9A6 6 0 1 1 8 6Zm-1.5 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" transform="translate(0 -3)" />
  ),
  export: (c) => (
    <Path fill={c} d="M12 2c.3 0 .6.1.8.3l4 4a1.1 1.1 0 0 1-1.6 1.6l-2.1-2.1V15a1.1 1.1 0 1 1-2.2 0V5.8L8.8 7.9a1.1 1.1 0 0 1-1.6-1.6l4-4c.2-.2.5-.3.8-.3ZM5.5 10H8a1 1 0 1 1 0 2H6v8h12v-8h-2a1 1 0 1 1 0-2h2.5c1.1 0 2 .9 2 2v8.5c0 1.1-.9 2-2 2h-13a2 2 0 0 1-2-2V12c0-1.1.9-2 2-2Z" />
  ),
  signOut: (c) => (
    <Path fill={c} d="M5.5 3H12a1 1 0 1 1 0 2H6v14h6a1 1 0 1 1 0 2H5.5A2.5 2.5 0 0 1 3 18.5v-13C3 4.1 4.1 3 5.5 3Zm10.8 4.3a1 1 0 0 1 1.4 0l4 4c.4.4.4 1 0 1.4l-4 4a1 1 0 0 1-1.4-1.4l2.3-2.3H10a1 1 0 1 1 0-2h8.6l-2.3-2.3a1 1 0 0 1 0-1.4Z" />
  ),
  info: (c) => (
    <Path fill={c} fillRule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 8.5a1 1 0 0 0-1 1v5a1 1 0 1 0 2 0v-5a1 1 0 0 0-1-1Zm0-4a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z" />
  ),
  warning: (c) => (
    <Path fill={c} d="M10.3 3.2a2 2 0 0 1 3.4 0l8.6 15a2 2 0 0 1-1.7 3H3.4a2 2 0 0 1-1.7-3l8.6-15ZM12 8.5c-.6 0-1 .4-1 1V14a1 1 0 1 0 2 0V9.5c0-.6-.4-1-1-1Zm0 8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z" />
  ),
  // Meal glyphs (replace 🥚🥗🍽️🍎)
  sunrise: (c) => (
    <>
      <Path fill={c} d="M12 10a6 6 0 0 1 6 6H6a6 6 0 0 1 6-6Z" />
      <Path fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" d="M2.5 19.5h19M12 3.5v3M4.6 8.6l1.8 1.8M19.4 8.6l-1.8 1.8" />
    </>
  ),
  sunMax: (c) => (
    <>
      <Circle fill={c} cx="12" cy="12" r="5" />
      <Path fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" d="M12 1.5v2.5M12 20v2.5M1.5 12H4M20 12h2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
    </>
  ),
  moonStars: (c) => (
    <>
      <Path fill={c} d="M9.2 4.3c.3.3.4.7.2 1.1a6.8 6.8 0 0 0 9 9c.4-.2.8-.1 1.1.2.3.3.4.7.2 1.1A9 9 0 1 1 8.1 4.1c.4-.2.8-.1 1.1.2Z" />
      <Path fill={c} d="M17 2.5l.6 1.6 1.6.6-1.6.6L17 7l-.6-1.7-1.6-.6 1.6-.6L17 2.5ZM20.5 8l.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4.4-1.1Z" />
    </>
  ),
  apple: (c) => (
    <>
      <Path fill={c} d="M12 7.8c1.4-1 3.4-1.6 5-1 2.8 1 3.6 4.6 2.6 8-.9 3.3-3 6.2-5.3 6.2-.9 0-1.6-.4-2.3-.4s-1.4.4-2.3.4c-2.3 0-4.4-2.9-5.3-6.2-1-3.4-.2-7 2.6-8 1.6-.6 3.6 0 5 1Z" />
      <Path fill={c} d="M12.6 6.6c-.3-2 .9-3.8 3-4.4.3 2-.9 3.9-3 4.4Z" />
    </>
  ),
};

export const ICON_NAMES = Object.keys(G);

export default function Icon({ name, size = 22, color = '#000', style }) {
  const draw = G[name];
  if (!draw) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style} accessibilityElementsHidden importantForAccessibility="no">
      {draw(color)}
    </Svg>
  );
}

/** Meal key → icon name, shared by Home and history screens. */
export const MEAL_ICONS = { BREAKFAST: 'sunrise', LUNCH: 'sunMax', DINNER: 'moonStars', SNACK: 'apple' };
