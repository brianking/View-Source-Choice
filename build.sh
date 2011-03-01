#!/bin/sh

mkdir -p chrome;
[ -f vsc.xpi ] && rm vsc.xpi;
zip -r9 vsc.xpi chrome.manifest install.rdf defaults/ chrome/ -x \*CVS/* -x \*.svn/* -x \*.git/* -x \*.zip -x \*.db -x \*.xcf -x \*.\*~ -x \*.DS_Store;
printf "build finished.";
