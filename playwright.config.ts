import { defineConfig, devices } from '@playwright/test';

/* The smoke test runs against the PRODUCTION BUILD, served exactly the way
   GitHub Pages will serve it. That is the whole point: the golden tests cover
   pure functions, and the one real bug this project has shipped was a dropped
   requestAnimationFrame that left every pure function correct and the game
   frozen. Only booting the built artifact catches that class. */

export default defineConfig({
  testDir: './e2e',
  /* These drive a software-rendered WebGL context against one shared preview
     server. Running them in parallel starves the frame loop, and because the
     loop clamps its delta the game then advances in slow motion. Serial is
     both faster in practice and deterministic. */
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',

  use: {
    baseURL: 'http://127.0.0.1:4173',
    /* a trace on the first retry makes a CI-only failure debuggable without
       reproducing it locally */
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    /* the game is portrait-first; test it at the shape it actually ships in */
    viewport: { width: 375, height: 812 },
    hasTouch: true
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        hasTouch: true,
        launchOptions: {
          /* headless Chrome has no GPU, so WebGL has to come from SwiftShader.
             Without these the renderer fails to construct and every assertion
             below fails for a reason that has nothing to do with the game. */
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader'
          ]
        }
      }
    }
  ],

  webServer: {
    /* bind explicitly: vite preview defaults to localhost, which resolves to
       ::1 on Windows, and then the 127.0.0.1 health check never succeeds */
    command: 'npm run preview -- --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
