import type { ContactIndexReadResult } from './add-person-contact-index';

// Pages are read only once; a cancelled pass resumes from the warm rows on reopening.
export class ContactIndexPager {
  private run: {
    userId: string;
    revision: number;
    loadedCount: number;
    timer: ReturnType<typeof setTimeout> | null;
  } | null = null;

  cancel() {
    if (this.run?.timer) clearTimeout(this.run.timer);
    this.run = null;
  }

  start(input: {
    userId: string;
    revision: number;
    result: ContactIndexReadResult;
    shouldContinue: () => boolean;
    readPage: (offset: number) => Promise<ContactIndexReadResult>;
    onPage: (result: ContactIndexReadResult) => Promise<void> | void;
    onError?: () => void;
  }) {
    if (
      input.result.status !== 'ready' ||
      input.result.contacts.length >= input.result.matchingCount
    ) {
      this.cancel();
      return;
    }
    if (
      this.run?.userId === input.userId &&
      this.run.revision === input.revision &&
      this.run.loadedCount >= input.result.contacts.length
    )
      return;
    this.cancel();
    const run = {
      userId: input.userId,
      revision: input.revision,
      loadedCount: input.result.contacts.length,
      timer: null as ReturnType<typeof setTimeout> | null,
    };
    this.run = run;
    let rows = input.result.contacts;
    const ids = new Set(rows.map((contact) => contact.contactId));
    const current = () => this.run === run && input.shouldContinue();
    const readNext = async () => {
      run.timer = null;
      try {
        if (!current()) {
          if (this.run === run) this.cancel();
          return;
        }
        const page = await input.readPage(rows.length);
        if (!current()) {
          if (this.run === run) this.cancel();
          return;
        }
        const additions = page.contacts.filter((contact) => !ids.has(contact.contactId));
        if (!additions.length) {
          this.cancel();
          return;
        }
        for (const contact of additions) ids.add(contact.contactId);
        rows = [...rows, ...additions];
        run.loadedCount = rows.length;
        await input.onPage({ ...input.result, contacts: rows });
        if (!current() || rows.length >= input.result.matchingCount) {
          if (this.run === run) this.cancel();
          return;
        }
        run.timer = setTimeout(() => {
          void readNext();
        }, 80);
      } catch {
        if (this.run === run) {
          this.cancel();
          input.onError?.();
        }
      }
    };
    run.timer = setTimeout(() => {
      void readNext();
    }, 700);
  }
}
