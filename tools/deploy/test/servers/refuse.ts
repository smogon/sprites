// A command that reads nothing and says no: what a refused manifest looks like
// from the deploy's side, with the exit code that goes with it.
process.stdout.write('No such asset set: sprites.\n');
process.exit(3);
