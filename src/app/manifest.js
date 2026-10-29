// Lets the app be installed (Add to Home Screen / Install app). On iPhone and iPad, device
// notifications only work once it's been added to the Home Screen and opened from there.
export default function manifest() {
  return {
    name: 'Shared To-Do',
    short_name: 'To-Do',
    description: 'To-do lists you can share with read, comment and write access.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0f1514',
    theme_color: '#0f1514',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
