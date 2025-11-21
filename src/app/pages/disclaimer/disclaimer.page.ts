import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'app-disclaimer',
  standalone: true,
  imports: [CommonModule, TranslocoModule],
  templateUrl: './disclaimer.page.html',
  styleUrls: ['./disclaimer.page.scss']
})
export class DisclaimerPage {
  constructor(private router: Router) {}

  onAccept() {
    this.router.navigate(['/input']);
  }

  onDecline() {
    this.router.navigate(['/login']);
  }
}
