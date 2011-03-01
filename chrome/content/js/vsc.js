/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is BRIKS, Brian King s.p.
 *
 * The Initial Developer of the Original Code is
 * Brian King <brian@mozdev.org>.
 * Portions created by the Initial Developer are Copyright (C) 2006-2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const vscClass = 
{
  vscprefs : Components.classes["@mozilla.org/preferences-service;1"].
                             getService(Components.interfaces.nsIPrefBranch),
  gViewSourceBundle : null,

  sidebarContainer : null,
  sidebarSplitter : null,
  verticalBox : null,
  verticalSplitter : null,

  /**
   * Preferences change observer
   */
  prefWatcher: {
    prefs: null,
    startup: function() {
      this.prefs = Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefService)
        .getBranch("extensions.vsc");
      this.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
      this.prefs.addObserver("", this, false);
    },
    shutdown: function()
    {
      this.prefs.removeObserver("", this);
    },
    observe: function(subject, topic, data) {
      if (topic != "nsPref:changed")
        return;
      vscClass.changed();
    }
  },

  /**
   * Initiate UI and listeners
   * Called on window load
   */
  init : function()
  {
    vscClass.sidebarContainer = document.getElementById("vsc-sidebar-container");
    vscClass.sidebarSplitter = document.getElementById("vsc-sidebar-splitter");
    vscClass.verticalBox = document.getElementById("vsc-vertical-box");
    vscClass.verticalSplitter = document.getElementById("vsc-vertical-splitter");

    vscClass.initListeners();

    // Migrate - Pref types and values have changed since 0.6,
    // So we need to ensure users with certain values are not stuck
    var vsWhere = vscClass.vscprefs.getIntPref("extensions.vsc.open");
    if (vsWhere > 3)
      vscClass.vscprefs.setIntPref("extensions.vsc.open", 3);
  },

  /**
   * Kick off various listeners
   */
  initListeners : function ()
  {
    var doc = document.getElementById("content");
    if (doc)
      doc.addProgressListener(vscClass.vscWebProgressListener);

    var popup = document.getElementById("contentAreaContextMenu");
    if (popup)
      popup.addEventListener("popupshowing", vscClass.vscBrowserContextMenu, false);

    // Tab select listener
    var tabs = gBrowser.tabContainer;
    tabs.addEventListener("TabSelect", vscClass.tabSelected, true);

    // Prefs listener
    vscClass.prefWatcher.startup();
  },

  /**
   * Override Firefox View Source
   */
  vscInterceptVS : function ()
  {
    var vscOn = vscClass.vscprefs.getBoolPref("extensions.vsc.enabled");
    var override = vscClass.vscprefs.getBoolPref("extensions.vsc.override");
    var page = content.location.href;
    if (vscOn && override) {
      var vsWhere = vscClass.vscprefs.getIntPref("extensions.vsc.open");
      var ioService = Components.classes["@mozilla.org/network/io-service;1"]
                      .getService(Components.interfaces.nsIIOService);
      var uri = ioService.newURI(page, null, null);
      var proto = uri.scheme;

      // Only load the source if we are not in source view already
      if (proto != "view-source")
        vscClass.loadSource("view-source:"+uri.spec, vsWhere);
    }
    else  {
      BrowserViewSourceOfDocument(content.location);  // Firefox version
    }
  },

  /**
   * Web Progress Listener for:
   * - detecting view-source protocol
   * - reload the source after a page loads if a custom panel is open
   */
  vscWebProgressListener : 
  {
    onProgressChange : function (wp, req, cur, max, curtotal, maxtotal) {},
    onStateChange : function (wp, req, state, status) {
      var vscOn = vscClass.vscprefs.getBoolPref("extensions.vsc.enabled");
      if (!req || !vscOn)
        return;
      const nsIWebProgressListener = Components.interfaces.nsIWebProgressListener;
      const nsIChannel = Components.interfaces.nsIChannel;
      if (state & nsIWebProgressListener.STATE_START) {
        var urlStr = req.QueryInterface(nsIChannel).URI.spec;
        var proto = req.QueryInterface(nsIChannel).URI.scheme;
        if (proto == "view-source")  {
          var vsWhere;
          try {
            vsWhere = vscClass.vscprefs.getIntPref("extensions.vsc.open");
          }
          catch (ex)  { 
            vsWhere = 0;  // default
          }
          // No need to cancel the request, because a new one will come after it anyway, whether the source or a rollback
          //req.cancel(Components.results.NS_ERROR_ABORT);
          var webNav = getWebNavigation();
          var selectedBrowser = getBrowser().selectedBrowser;
          if (selectedBrowser.lastURI) {
            var prevUrl = selectedBrowser.lastURI.spec;
            try  {
              if (vsType != 0)  {
                selectedBrowser.loadURI(prevUrl);
              }
              else  {
                if (webNav.canGoBack)
                  webNav.goBack();
              }
            }
            catch(ex)  {}
            if (prevUrl != urlStr)  // fix for mozdev bug 14837
              vscClass.loadSource(urlStr, vsWhere);
          }
        }
      }
      else if (state & nsIWebProgressListener.STATE_STOP) {
          if (vscClass.isCustomOpen())
            vscClass.loadCustom();
      }
    },
    onLocationChange : function (wp, req, loc) {},
    onStatusChange : function (wp, req, status, message) {},
    onSecurityChange : function (wp, req, state) {},
    startDocumentLoad : function(req) {},
    endDocumentLoad : function(req, status) { }
  },

  /**
   * The tab has been switched, re-load the source
   */
  tabSelected : function (aEvent)
  {
    if (!vscClass.sidebarContainer.collapsed || !vscClass.verticalBox.collapsed) {
      var vsWhere = vscClass.vscprefs.getIntPref("extensions.vsc.open");
      vscClass.loadSource("view-source:"+content.document.location.href, vsWhere);
    }
  },

  /**
   * Now load the source in the location of choice
   * i.e. current content, new tab, or new window
   * If aType is passed in, it means we redirected it earlier and it should just load in current
   * Otherwise, observe the pref
   *
   * @param aUrl Page url to load source of/from
   * @param aWhere integer, ususally retrieved from 'open' pref, where to load the source
   */
  loadSource : function (aUrl, aWhere)
  { 
    var loadWhere;
    switch  (aWhere) {
      case 0: loadWhere = "current";
              break;
      case 1: loadWhere = "tab";
              break;
      case 2: loadWhere = "window";
              break;
      case 3: vscClass.loadCustom(aUrl);
              return;
      default: loadWhere = "current";
               break;
    }
    // from browser/base/content/utilityOverlay.js
    // "current", "window" or "tab"
    openUILinkIn(aUrl, loadWhere);
  },

  /**
   * Load the source into the sidebar/verticalbar
   *
   * @param aUrl Page url to load source of/from
   */
  loadCustom : function (aUrl)
  {
    var sourceUrl = aUrl ? aUrl : "view-source:"+getBrowser().selectedBrowser.currentURI.spec;
    var vcPosition = vscClass.vscprefs.getIntPref("extensions.vsc.position");

    if (sourceUrl) {
        var browserid = (vcPosition == 0 || vcPosition == 1) ? "vsc-sidebar" : "vsc-verticalbar";
        var titleid = (vcPosition == 0 || vcPosition == 1) ? "vsc-sidebar-title" : "vsc-vertical-title";
        document.getElementById(browserid).loadURI(sourceUrl);
        document.getElementById(titleid).value = "VSC : "+document.title;
        vscClass.toggleCustom("true");
    }
  },

  /**
   * Open/Close left/right/top/bottom
   *
   * @param aForce boolean - force open
   */
  /* */
  toggleCustom : function (aForce)
  {
    var vsPosition = vscClass.vscprefs.getIntPref("extensions.vsc.position");

    var sidebarClosed = vscClass.sidebarContainer.collapsed;
    var c = document.getElementById("content");
    var ac = document.getElementById("appcontent");
    var vertClosed = vscClass.verticalBox.collapsed;

    switch (vsPosition) {
      case 0:  // sidebar left
        vscClass.sidebarContainer.removeAttribute("collapsed");
        vscClass.sidebarContainer.removeAttribute("onright");
        vscClass.sidebarSplitter.hidden = false;
        c.setAttribute("vsc-dir", "left");
        vscClass.verticalBox.collapsed = true;
        vscClass.verticalSplitter.hidden = true;
        break;
      case 1: // sidebar right
        vscClass.sidebarContainer.removeAttribute("collapsed");
        vscClass.sidebarContainer.setAttribute("onright", "true");
        vscClass.sidebarSplitter.hidden = false;
        c.setAttribute("vsc-dir", "right");
        vscClass.verticalBox.collapsed = true;
        vscClass.verticalSplitter.hidden = true;
        break;
      case 2: // bottom bar
        vscClass.verticalBox.removeAttribute("collapsed");
        vscClass.verticalSplitter.setAttribute("hidden", false);
        ac.setAttribute("vsc-dir", "bottom");
        vscClass.sidebarContainer.collapsed = true;
        vscClass.sidebarSplitter.hidden = true;
        break;
      case 3: // top bar
        vscClass.verticalBox.removeAttribute("collapsed");
        vscClass.verticalSplitter.setAttribute("hidden", false);
        ac.setAttribute("vsc-dir", "top");
        vscClass.sidebarContainer.collapsed = true;
        vscClass.sidebarSplitter.hidden = true;
        break;
      default:
        vscClass.sidebarContainer.collapsed = true;
        vscClass.sidebarSplitter.hidden = true;
        vscClass.verticalBox.collapsed = true;
        vscClass.verticalSplitter.hidden = true;
    }
  },

  /**
   * Preference has changed
   */
  changed : function()
  {
    if (this.isCustomOpen()) {
      var vsWhere = vscClass.vscprefs.getIntPref("extensions.vsc.open");
      if (vsWhere == 3) {
        this.close();
        this.loadCustom();
      }
    }
  },

  /**
   * Is sidebar or vertical bar open
   *
   * @returns {boolean} sidebar is open
   */
  isCustomOpen : function()
  {
    if (!vscClass.sidebarContainer.collapsed || !vscClass.verticalBox.collapsed)
      return true;
    return false;
  },

  /**
   * Close the sidebar / vertical bar
   */
  close : function()
  {
    vscClass.sidebarContainer.collapsed = true;
    vscClass.sidebarSplitter.hidden = true;
    vscClass.verticalBox.collapsed = true;
    vscClass.verticalSplitter.hidden = true;
  },

  /**
   * Retrieve the string bundle
   *
   * @returns {XUL Element} XUL stringbundle
   */
  getViewSourceBundle : function()
  {
    if (!vscClass.gViewSourceBundle)
      vscClass.gViewSourceBundle = document.getElementById("viewSourceBundle");
    return vscClass.gViewSourceBundle;
  },

  /** CONTEXT MENU FUNCTIONS **/

  /**
   * Browser context menu is opened
   * Set up via "popupshowing" event listener earlier in initListeners
   */
  vscBrowserContextMenu : function ()
  {
    // Turning off selection source until it is working correctly
    //gContextMenu.showItem( "vsc-context-viewpartialsource-selection", gContextMenu.isContentSelected );

    gContextMenu.showItem( "vsc-context-viewsource", !( gContextMenu.inDirList 
                            || gContextMenu.onImage 
                            || gContextMenu.isContentSelected 
                            || gContextMenu.onLink 
                            || gContextMenu.onTextInput ) );
    setTimeout("vscClass.hideContextGuff", 10);
  },

  /**
   * Hide exisiting Firefox View Source context menu items
   *
   * XX does not work
   */
  hideContextGuff : function()
  {
    // Now lets hide the default ones, which we don't really need because the user might be confused!
    //gContextMenu.showItem( "context-viewpartialsource-selection", false );
    gContextMenu.showItem( "context-viewsource", false );
  },

  /**
   * A much abbreviated version of the function from browser
   * Used from the VSC context menu item
   */
  BrowserViewSourceOfDocument : function (aDocument)
  {
    var vscOn = vscClass.vscprefs.getBoolPref("extensions.vsc.enabled");
    if (!vscOn)
      return;
    var vsWhere = vscClass.vscprefs.getIntPref("extensions.vsc.open");
    vscClass.loadSource("view-source:"+aDocument.location.href, vsWhere);
  },

  /**
   * View Partial Source (from context menu)
   * A copy of the same function in browser.js (class nsContextMenu) ...
   * changed to redirect source to user choice in this extension
   *
   * XX Currently not being used
   * @param context string on what document context we are in
   */
  viewPartialSource : function ( context ) {
    var focusedWindow = document.commandDispatcher.focusedWindow;
    if (focusedWindow == window)
      focusedWindow = content;
      var docCharset = null;
    if (focusedWindow)
      docCharset = "charset=" + focusedWindow.document.characterSet;

    // "View Selection Source" and others such as "View MathML Source"
    // are mutually exclusive, with the precedence given to the selection
    // when there is one
    var reference = null;
    if (context == "selection")
      reference = focusedWindow.getSelection();
    else if (context == "mathml")
      reference = this.target;
    else
      throw "not reached";

    var docUrl = null; // unused (and play nice for fragments generated via XSLT too)
    onLoadViewPartialSource(docUrl, docCharset, reference, context);  // vscViewPartialSource.js
  }

};

/* Console logger */

const vscLog = {
  
  consoleService : Components.classes['@mozilla.org/consoleservice;1'].getService(Components.interfaces.nsIConsoleService),
  
  logMessage : function (text)
  {
    this.consoleService.logStringMessage("VSC Message : "+text);  
  }
  
};

addEventListener("load", vscClass.init, false);
