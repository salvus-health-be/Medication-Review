import { Component, signal, HostListener, OnInit } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { filter } from 'rxjs/operators';
import { StateService } from './services/state.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, CommonModule, TranslocoModule],
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
export class App implements OnInit {
  protected readonly title = signal('MVP-5');
  isLoginPage: boolean = false;
  isMobileView: boolean = false;
  private readonly MOBILE_BREAKPOINT = 1024;

  constructor(private router: Router, private stateService: StateService) {
    // Check current route on initialization
    this.checkRoute(this.router.url);

    // Subscribe to route changes
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.checkRoute(event.url);
      });
  }

  ngOnInit() {
    this.checkScreenSize();
  }

  @HostListener('window:resize')
  onResize() {
    this.checkScreenSize();
  }

  private checkScreenSize() {
    this.isMobileView = window.innerWidth < this.MOBILE_BREAKPOINT;
  }

  private checkRoute(url: string) {
    this.isLoginPage = url === '/login' || url === '/' || url === '/disclaimer';
  }

  onOpenNoteOverview() {
    // Emit to state service so analysis page can listen
    this.stateService.openNoteOverviewModal();
  }
}
