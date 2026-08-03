const HOUR = 3_600_000;

export class ResumeServiceSlaCalculator {
  dueAt(start: Date, workingHours = 48): Date {
    let cursor = new Date(start);
    cursor = this.#nextWorkingInstant(cursor);
    let remaining = workingHours;
    while (remaining > 0) {
      cursor = new Date(cursor.getTime() + HOUR);
      if (this.#isWorkingDay(cursor)) remaining -= 1;
    }
    return cursor;
  }

  resumeAt(resumedAt: Date, remainingSeconds: number): Date {
    return this.dueAt(resumedAt, remainingSeconds / 3600);
  }

  remainingSeconds(pausedAt: Date, dueAt: Date): number {
    let cursor = new Date(pausedAt);
    let seconds = 0;
    while (cursor < dueAt) {
      const next = new Date(Math.min(cursor.getTime() + HOUR, dueAt.getTime()));
      if (this.#isWorkingDay(cursor)) seconds += (next.getTime() - cursor.getTime()) / 1000;
      cursor = next;
    }
    return Math.max(0, Math.floor(seconds));
  }

  #isWorkingDay(value: Date): boolean {
    const day = value.getUTCDay();
    return day !== 0 && day !== 6;
  }

  #nextWorkingInstant(value: Date): Date {
    const result = new Date(value);
    while (!this.#isWorkingDay(result)) result.setUTCDate(result.getUTCDate() + 1);
    return result;
  }
}
