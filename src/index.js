import { ensureDataDir, getAllLeads, getStats } from './lead-store.js';
import { importLeadsFromExcel } from './import-excel.js';
import { loginToWhatsApp, sendOpeningMessages } from './send-messages.js';
import { printUsage } from './utils.js';

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() || 'help';
  const options = {
    limit: null,
    filter: null,
    dryRun: false,
    file: null,
  };

  while (args.length > 0) {
    const token = args.shift();

    if (token === '--limit') {
      options.limit = Number(args.shift());
      continue;
    }

    if (token === '--filter') {
      options.filter = args.shift();
      continue;
    }

    if (token === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (!options.file && !token.startsWith('--')) {
      options.file = token;
    }
  }

  return { command, options };
}

function printStatus(filter = null) {
  const stats = getStats();
  console.log('\nסיכום לידים:');
  console.log(`  סה"כ: ${stats.total}`);
  console.log(`  ממתינים: ${stats.pending}`);
  console.log(`  נשלחו: ${stats.sent}`);
  console.log(`  נכשלו: ${stats.failed}`);

  const leads = getAllLeads().filter((lead) => !filter || lead.status === filter);

  if (leads.length === 0) {
    console.log('\nאין לידים להצגה.');
    return;
  }

  console.log('\nרשימת לידים:');
  for (const lead of leads) {
    const name = lead.name ? ` (${lead.name})` : '';
    console.log(`- ${lead.phone}${name} | ${lead.status} | ${lead.sourceFile || '-'}`);
  }
}

async function main() {
  ensureDataDir();

  const { command, options } = parseArgs(process.argv.slice(2));

  switch (command) {
    case 'import':
      if (!options.file) {
        throw new Error('יש לציין נתיב לקובץ אקסל: npm run import -- data/imports/leads.xlsx');
      }
      const importResult = importLeadsFromExcel(options.file);
      console.log(`יובאו ${importResult.added} לידים חדשים (${importResult.skipped} דולגו)`);
      console.log(`סה"כ במערכת: ${importResult.total}`);
      break;

    case 'send':
      const sendResult = await sendOpeningMessages({
        userId: 'cli',
        limit: options.limit,
        dryRun: options.dryRun,
        keepClientOpen: false,
      });
      console.log(`הושלם: ${sendResult.sent} נשלחו, ${sendResult.failed} נכשלו`);
      break;

    case 'login':
      await loginToWhatsApp();
      break;

    case 'status':
      printStatus(options.filter);
      break;

    case 'help':
    default:
      printUsage();
      break;
  }
}

main().catch((error) => {
  console.error(`שגיאה: ${error.message}`);
  process.exit(1);
});
