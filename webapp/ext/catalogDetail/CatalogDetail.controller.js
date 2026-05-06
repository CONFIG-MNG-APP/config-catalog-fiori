sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/BusyIndicator",
    "sap/ui/core/routing/HashChanger",
  ],
  function (Controller, JSONModel, MessageToast, MessageBox, BusyIndicator, HashChanger) {
    "use strict";

    function _getSapClient() {
      return new URLSearchParams(window.location.search).get("sap-client") || "324";
    }

    var CDS_SEMANTIC_MAP = {
      ZI_MM_ROUTE_CONF: { object: "MMRoute",     action: "manage"   },
      ZI_SD_PRICE_CONF: { object: "SDPrice",     action: "manage"   },
      ZI_FI_LIMIT_CONF: { object: "FILimit",     action: "manage"   },
      ZI_MM_SAFE_STOCK: { object: "MMSafeStock", action: "maintain" },
    };

    var LOCAL_PATH_MAP = {
      ZI_MM_ROUTE_CONF: "http://localhost:8082/index.html",
      ZI_SD_PRICE_CONF: "http://localhost:8083/index.html",
      ZI_FI_LIMIT_CONF: "http://localhost:8084/index.html",
      ZI_MM_SAFE_STOCK: "http://localhost:8085/index.html",
    };

    function _crossNavTo(sSemanticObject, sAction, oParams) {
      var oCrossNav = sap.ushell && sap.ushell.Container &&
        sap.ushell.Container.getService("CrossApplicationNavigation");
      if (oCrossNav) {
        var oTarget = { semanticObject: sSemanticObject, action: sAction };
        if (sSemanticObject === "ConfRequest") {
          oTarget.appSpecificRoute = "&&/catalog";
        }
        oCrossNav.toExternal({ target: oTarget, params: oParams });
      } else {
        var sBase = sSemanticObject === "ConfRequest"
          ? "http://localhost:8081/index.html"
          : (LOCAL_PATH_MAP[Object.keys(CDS_SEMANTIC_MAP).find(function (k) {
              return CDS_SEMANTIC_MAP[k].object === sSemanticObject;
            })] || "http://localhost:8082/index.html");
        var sQuery = Object.keys(oParams).map(function (k) {
          return encodeURIComponent(k) + "=" + encodeURIComponent(oParams[k]);
        }).join("&");
        if (sSemanticObject === "ConfRequest") {
          window.open(sBase + "#catalog?" + sQuery, "_self");
        } else {
          window.open(sBase + "?" + sQuery, "_self");
        }
      }
    }

    function _formatDate(sVal) {
      if (!sVal) return "–";
      try {
        return new Date(sVal).toLocaleDateString("en-US", {
          month: "short", day: "numeric", year: "numeric",
        });
      } catch (e) { return sVal; }
    }

    var MODULE_STATE_MAP = { MM: "Information", SD: "Success", FI: "Warning" };

    return Controller.extend("zgsp26.conf.mng.confmngcatalog.ext.catalogDetail.CatalogDetail", {

      onInit: function () {
        var oModel = new JSONModel({
          loading:     true,
          loadingDefs: true,
          catalog: {
            ConfId: "", ConfName: "Loading...", ModuleId: "–", ConfType: "–",
            Description: "–", TargetCds: "–", IsActive: false,
            StatusText: "–",  StatusState: "None",
            ModuleState: "None",
            CreatedBy: "–",   CreatedAt: "–",
            ChangedBy: "–",   ChangedAt: "–",
          },
          fieldDefs: [],
          fieldCount: 0,
        });
        this.getView().setModel(oModel, "detail");

        // Strategy 1: walk up owner-component chain to find the app-level router
        // (sap.fe.core.fpm wraps this view in a sub-component with no router of its own)
        var oRouter = this._getAppRouter();
        if (oRouter) {
          oRouter.attachRouteMatched(this._onRouteMatched, this);
        }

        // Strategy 2: listen to native hashchange — fires reliably when the hash
        // is already set to ConfigCatalog(...) at the time this view is rendered,
        // or when the user navigates back and forth.
        this._fnHashChange = this._loadFromHash.bind(this);
        window.addEventListener("hashchange", this._fnHashChange);

        // Strategy 3: try to load from the current hash immediately
        // (covers hard-reload / direct URL access)
        // Use a small defer to let the router finish updating the hash first
        var that = this;
        setTimeout(function () { that._loadFromHash(); }, 0);
      },

      onExit: function () {
        if (this._fnHashChange) {
          window.removeEventListener("hashchange", this._fnHashChange);
        }
        var oRouter = this._getAppRouter();
        if (oRouter) {
          oRouter.detachRouteMatched(this._onRouteMatched, this);
        }
      },

      /** Walk up owner-component chain to find the router that owns "CatalogDetail". */
      _getAppRouter: function () {
        try {
          var oComp = this.getOwnerComponent();
          while (oComp) {
            var oRouter = oComp.getRouter && oComp.getRouter();
            if (oRouter && oRouter.getRoute && oRouter.getRoute("CatalogDetail")) {
              return oRouter;
            }
            oComp = oComp.getOwnerComponent ? oComp.getOwnerComponent() : null;
          }
        } catch (e) { /* ignore */ }
        return null;
      },

      _loadFromHash: function () {
        // Hash may look like: ConfigCatalog(guid)  or  /ConfigCatalog(guid)&/...
        var sHash  = decodeURIComponent(window.location.hash.replace(/^#\/?/, ""));
        var oMatch = sHash.match(/ConfigCatalog\(([^)]+)\)/);
        if (!oMatch) { return; }
        var sConfId = oMatch[1];
        // Avoid duplicate loads if confId hasn't changed
        if (sConfId === this._sLastConfId) { return; }
        this._sLastConfId = sConfId;
        this._loadCatalog(sConfId);
        this._loadFieldDefs(sConfId);
      },

      _onRouteMatched: function (oEvent) {
        if (oEvent.getParameter("name") !== "CatalogDetail") { return; }
        var sConfId = decodeURIComponent(oEvent.getParameter("arguments").confId || "");
        if (!sConfId || sConfId === this._sLastConfId) { return; }
        this._sLastConfId = sConfId;
        this._loadCatalog(sConfId);
        this._loadFieldDefs(sConfId);
      },

      _loadCatalog: function (sConfId) {
        var oModel  = this.getView().getModel("detail");
        var sClient = _getSapClient();
        oModel.setProperty("/loading", true);

        // OData v4 composite key: ConfId (Edm.Guid) + IsActiveEntity (Edm.Boolean)
        var sUrl =
          "/sap/opu/odata4/sap/zui_conf_catalog/srvd/sap/zsd_conf_catalog/0001/" +
          "ConfigCatalog(ConfId=" + sConfId + ",IsActiveEntity=true)" +
          "?$select=ConfId,ConfName,ModuleId,ConfType,Description,TargetCds,IsActive,CreatedBy,CreatedAt,ChangedBy,ChangedAt" +
          "&sap-client=" + sClient;

        fetch(sUrl, {
          credentials: "include",
          headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            oModel.setProperty("/catalog", {
              ConfId:      data.ConfId       || "",
              ConfName:    data.ConfName     || "–",
              ModuleId:    data.ModuleId     || "–",
              ConfType:    data.ConfType     || "–",
              Description: data.Description  || "–",
              TargetCds:   data.TargetCds    || "–",
              IsActive:    !!data.IsActive,
              StatusText:  data.IsActive ? "Active" : "Inactive",
              StatusState: data.IsActive ? "Success" : "None",
              ModuleState: MODULE_STATE_MAP[data.ModuleId] || "None",
              CreatedBy:   data.CreatedBy    || "–",
              CreatedAt:   _formatDate(data.CreatedAt),
              ChangedBy:   data.ChangedBy    || "–",
              ChangedAt:   _formatDate(data.ChangedAt),
            });
            oModel.setProperty("/loading", false);
          })
          .catch(function () {
            oModel.setProperty("/loading", false);
            MessageToast.show("Failed to load catalog details");
          });
      },

      _loadFieldDefs: function (sConfId) {
        var oModel  = this.getView().getModel("detail");
        var sClient = _getSapClient();
        oModel.setProperty("/loadingDefs", true);

        // OData v4 composite key: ConfId (Edm.Guid) + IsActiveEntity (Edm.Boolean)
        var sUrl =
          "/sap/opu/odata4/sap/zui_conf_catalog/srvd/sap/zsd_conf_catalog/0001/" +
          "ConfigCatalog(ConfId=" + sConfId + ",IsActiveEntity=true)/_FieldDef" +
          "?$select=FieldName,FieldLabel,DataType,IsRequired,ValueHelpType" +
          "&$orderby=FieldName asc" +
          "&sap-client=" + sClient;

        fetch(sUrl, {
          credentials: "include",
          headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            var aDefs = data.value || [];
            oModel.setProperty("/fieldDefs",   aDefs);
            oModel.setProperty("/fieldCount",  aDefs.length);
            oModel.setProperty("/loadingDefs", false);
          })
          .catch(function () {
            oModel.setProperty("/loadingDefs", false);
          });
      },

      onNavBack: function () {
        HashChanger.getInstance().setHash("");
      },

      // ── Action: View Current Config ──────────────────────────────────
      onViewConfigPress: function () {
        var oData = this.getView().getModel("detail").getProperty("/catalog");
        if (!oData.ConfId) { MessageBox.error("ConfId is missing"); return; }
        var oSemantic = CDS_SEMANTIC_MAP[oData.TargetCds] || CDS_SEMANTIC_MAP["ZI_MM_ROUTE_CONF"];
        _crossNavTo(oSemantic.object, oSemantic.action, {
          "sap-client": _getSapClient(),
          ConfId:    oData.ConfId,
          ConfName:  oData.ConfName,
          ModuleId:  oData.ModuleId,
          TargetCds: oData.TargetCds,
          EnvId:     "DEV",
          Mode:      "VIEW",
        });
      },

      // ── Action: View Requests ────────────────────────────────────────
      onViewRequestsPress: function () {
        var oData = this.getView().getModel("detail").getProperty("/catalog");
        if (!oData.ConfId) { MessageBox.error("ConfId is missing"); return; }
        _crossNavTo("ConfRequest", "manage", {
          "sap-client": _getSapClient(),
          ConfId:    oData.ConfId,
          ConfName:  oData.ConfName,
          ModuleId:  oData.ModuleId,
          TargetCds: oData.TargetCds,
          EnvId:     "DEV",
          Mode:      "VIEW_LIST",
        });
      },

      // ── Action: Maintain via Request ─────────────────────────────────
      onMaintainPress: async function () {
        var oData = this.getView().getModel("detail").getProperty("/catalog");
        if (!oData.ConfId) { MessageBox.error("ConfId is missing"); return; }

        if (!oData.IsActive) {
          MessageBox.error(
            "Configuration '" + oData.ConfName + "' is currently inactive and cannot be maintained. " +
            "Please contact your administrator to activate this configuration."
          );
          return;
        }

        BusyIndicator.show(0);
        try {
          var sServiceUrl =
            "/sap/opu/odata4/sap/zui_conf_req/srvd/sap/zsd_conf_req/0001/?sap-client=" + _getSapClient();
          var oTokenResp  = await fetch(sServiceUrl, {
            method: "GET",
            headers: { "X-CSRF-Token": "Fetch", "X-Requested-With": "XMLHttpRequest" },
            credentials: "include",
          });
          var sCsrfToken = oTokenResp.headers.get("X-CSRF-Token");
          if (!sCsrfToken) { BusyIndicator.hide(); MessageBox.error("Cannot fetch CSRF token"); return; }

          var sActionUrl =
            "/sap/opu/odata4/sap/zui_conf_req/srvd/sap/zsd_conf_req/0001/" +
            "ZC_CONF_REQ_H/com.sap.gateway.srvd.zsd_conf_req.v0001.createRequest" +
            "?sap-client=" + _getSapClient();

          var oResponse = await fetch(sActionUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": sCsrfToken,
              "X-Requested-With": "XMLHttpRequest",
              Accept: "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
              ConfId:      oData.ConfId,
              ModuleId:    oData.ModuleId,
              ConfName:    oData.ConfName,
              TargetCds:   oData.TargetCds,
              ActionType:  "CREATE",
              TargetEnvId: "DEV",
              Reason:      "",
              Notes:       "",
            }),
          });

          BusyIndicator.hide();
          if (!oResponse.ok) {
            var oErr = await oResponse.json().catch(function () { return {}; });
            MessageBox.error(oErr?.error?.message || "createRequest failed: " + oResponse.status);
            return;
          }

          _crossNavTo("ConfRequest", "manage", {
            "sap-client": _getSapClient(),
            ConfId:    oData.ConfId,
            ConfName:  oData.ConfName,
            ModuleId:  oData.ModuleId,
            TargetCds: oData.TargetCds,
            EnvId:     "DEV",
          });
        } catch (e) {
          BusyIndicator.hide();
          MessageBox.error(e?.message || "createRequest failed");
        }
      },

    });
  }
);
