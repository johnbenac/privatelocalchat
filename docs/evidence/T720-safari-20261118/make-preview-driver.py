#!/usr/bin/python3
# Makes the in-page driver the real-Safari run used: python3 make-preview-driver.py <package file> <name shown to the app> > driver.js
# The driver gives the app's own file input a File through DataTransfer (so the real button, the real reader and the real preview run), and returns what the page drew.
# To run it: wrap it as in plc-offline.sh (window.__prev=null;(async()=>{ ... })().then(v=>{window.__prev=v});'started') and run it in a tab whose URL carries your own runner marker.
import base64,sys
t=open(__file__.replace('make-preview-driver.py','preview-driver.template.js')).read()
raw=open(sys.argv[1],'rb').read()
print(t.replace('@@BASE64_OF_THE_PACKAGE_FILE@@',base64.b64encode(raw).decode()).replace('@@FILE_NAME@@',sys.argv[2]))
