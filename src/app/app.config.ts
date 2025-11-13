import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';
import { TranslocoHttpLoader } from './transloco-loader';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { APP_INITIALIZER } from '@angular/core';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(), provideHttpClient(), provideTransloco({
        config: { 
          availableLangs: ['en', 'nl', 'fr'],
          // If a user previously selected a language, prefer that as the default
          defaultLang: (localStorage.getItem('selectedLang') || 'en'),
          // Remove this option if your application doesn't support changing language in runtime.
          reRenderOnLangChange: true,
          prodMode: !isDevMode(),
        },
        loader: TranslocoHttpLoader
      }),
      // Ensure TranslocoService uses stored language when the app starts
      {
        provide: APP_INITIALIZER,
        useFactory: (transloco: TranslocoService) => {
          return () => {
            const saved = localStorage.getItem('selectedLang');
            if (saved) {
              transloco.setActiveLang(saved);
            }
          };
        },
        deps: [TranslocoService],
        multi: true
      }
  ]
};
