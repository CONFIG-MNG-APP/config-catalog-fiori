sap.ui.define(
  ["sap/m/MessageBox", "sap/ui/core/BusyIndicator"],
  function (MessageBox, BusyIndicator) {
    "use strict";

    function _getSapClient() {
      return new URLSearchParams(window.location.search).get("sap-client") || "324";
    }

    function _getReqServiceUrl() {
      return "/sap/opu/odata4/sap/zui_conf_req/srvd/sap/zsd_conf_req/0001/?sap-client=" + _getSapClient();
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
        oCrossNav.toExternal({
          target: { semanticObject: sSemanticObject, action: sAction },
          params: oParams,
        });
      } else {
        var sBase = sSemanticObject === "ConfRequest"
          ? "http://localhost:8081/index.html"
          : (LOCAL_PATH_MAP[Object.keys(CDS_SEMANTIC_MAP).find(function (k) {
              return CDS_SEMANTIC_MAP[k].object === sSemanticObject;
            })] || "http://localhost:8082/index.html");
        var sQuery = Object.keys(oParams).map(function (k) {
          return encodeURIComponent(k) + "=" + encodeURIComponent(oParams[k]);
        }).join("&");
        window.open(sBase + "?" + sQuery, "_self");
      }
    }

    async function _fetchCsrfToken(sServiceUrl) {
      const oResp = await fetch(sServiceUrl, {
        method: "GET",
        headers: { "X-CSRF-Token": "Fetch", "X-Requested-With": "XMLHttpRequest" },
        credentials: "include",
      });
      if (!oResp.ok) return null;
      return oResp.headers.get("X-CSRF-Token") || null;
    }

    async function _queryNewReqId(sConfId) {
      const sUrl =
        "/sap/opu/odata4/sap/zui_conf_req/srvd/sap/zsd_conf_req/0001/" +
        "ZC_CONF_REQ_H" +
        "?$filter=ConfId eq " + sConfId +
        "&$orderby=CreatedAt desc" +
        "&$top=1" +
        "&$select=ReqId,ConfId,ModuleId,ReqTitle" +
        "&sap-client=" + _getSapClient();

      const oResp = await fetch(sUrl, {
        method: "GET",
        headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
        credentials: "include",
      });
      if (!oResp.ok) return null;
      const oData = await oResp.json();
      const aResults = oData?.value || [];
      return aResults.length > 0 ? aResults[0] : null;
    }

    return {
      /**
       * Navigate to the Config app (e.g. MM Routes) in VIEW mode
       * to see current master data without creating a request.
       */
      onViewConfigPress: async function (oContext) {
        try {
          let oBindingContext = null;
          if (oContext && typeof oContext.requestObject === "function") {
            oBindingContext = oContext;
          } else if (Array.isArray(oContext) && oContext[0]) {
            oBindingContext = oContext[0];
          }
          if (!oBindingContext) { MessageBox.error("No binding context found"); return; }

          const oData      = await oBindingContext.requestObject();
          const sConfId    = oData?.ConfId    || "";
          const sModuleId  = oData?.ModuleId  || "";
          const sConfName  = oData?.ConfName  || "";
          const sTargetCds = oData?.TargetCds || "";

          if (!sConfId) { MessageBox.error("ConfId is missing"); return; }

          var oSemantic = CDS_SEMANTIC_MAP[sTargetCds] || CDS_SEMANTIC_MAP["ZI_MM_ROUTE_CONF"];
          _crossNavTo(oSemantic.object, oSemantic.action, {
            "sap-client": _getSapClient(),
            ConfId:    sConfId,
            ConfName:  sConfName,
            ModuleId:  sModuleId,
            TargetCds: sTargetCds,
            EnvId:     "DEV",
            Mode:      "VIEW",
          });
        } catch (e) {
          console.error("onViewConfigPress error:", e);
          MessageBox.error(e?.message || "Navigation failed");
        }
      },

      /**
       * Navigate to the Request app to VIEW existing requests for this catalog,
       * without creating a new request.
       */
      onViewRequestsPress: async function (oContext) {
        try {
          let oBindingContext = null;
          if (oContext && typeof oContext.requestObject === "function") {
            oBindingContext = oContext;
          } else if (Array.isArray(oContext) && oContext[0]) {
            oBindingContext = oContext[0];
          }
          if (!oBindingContext) {
            MessageBox.error("No binding context found");
            return;
          }

          const oData      = await oBindingContext.requestObject();
          const sConfId    = oData?.ConfId    || "";
          const sModuleId  = oData?.ModuleId  || "";
          const sConfName  = oData?.ConfName  || "";
          const sTargetCds = oData?.TargetCds || "";

          if (!sConfId) {
            MessageBox.error("ConfId is missing");
            return;
          }

          _crossNavTo("ConfRequest", "manage", {
            "sap-client": _getSapClient(),
            ConfId:    sConfId,
            ConfName:  sConfName,
            ModuleId:  sModuleId,
            TargetCds: sTargetCds,
            EnvId:     "DEV",
            Mode:      "VIEW_LIST",
          });
        } catch (e) {
          console.error("onViewRequestsPress error:", e);
          MessageBox.error(e?.message || "Navigation failed");
        }
      },

      onMaintainPress: async function (oContext) {
        try {
          // 1. Get binding context
          let oBindingContext = null;
          if (oContext && typeof oContext.requestObject === "function") {
            oBindingContext = oContext;
          } else if (Array.isArray(oContext) && oContext[0]) {
            oBindingContext = oContext[0];
          }
          if (!oBindingContext) {
            MessageBox.error("No binding context found");
            return;
          }

          // 2. Read catalog data
          const oData     = await oBindingContext.requestObject();
          const sConfId   = oData?.ConfId    || "";
          const sModuleId = oData?.ModuleId  || "";
          const sConfName = oData?.ConfName  || "";
          const sTargetCds = oData?.TargetCds || "";

          if (!sConfId) {
            MessageBox.error("ConfId is missing");
            return;
          }

          BusyIndicator.show(0);

          // 3. CSRF token
          const sCsrfToken = await _fetchCsrfToken(_getReqServiceUrl());
          if (!sCsrfToken) {
            BusyIndicator.hide();
            MessageBox.error("Cannot fetch CSRF token");
            return;
          }

          // 4. Call createRequest — title/reason will be edited in MM Routes app
          const sActionUrl =
            "/sap/opu/odata4/sap/zui_conf_req/srvd/sap/zsd_conf_req/0001/" +
            "ZC_CONF_REQ_H/" +
            "com.sap.gateway.srvd.zsd_conf_req.v0001.createRequest" +
            "?sap-client=" + _getSapClient();

          const oResponse = await fetch(sActionUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": sCsrfToken,
              "X-Requested-With": "XMLHttpRequest",
              Accept: "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
              ConfId:      sConfId,
              ModuleId:    sModuleId,
              ConfName:    sConfName,
              TargetCds:   sTargetCds,
              ActionType:  "CREATE",
              TargetEnvId: "DEV",
              Reason:      "",
              Notes:       "",
            }),
          });

          if (!oResponse.ok) {
            BusyIndicator.hide();
            const oErr = await oResponse.json().catch(() => ({}));
            MessageBox.error(oErr?.error?.message || "createRequest failed: " + oResponse.status);
            return;
          }

          // 5. Query the new ReqId
          const oNewReq = await _queryNewReqId(sConfId);
          BusyIndicator.hide();

          if (!oNewReq?.ReqId) {
            MessageBox.error("Request created but could not retrieve ReqId");
            return;
          }

          // 6. Navigate to Request App — CatalogLanding page
          _crossNavTo("ConfRequest", "manage", {
            "sap-client": _getSapClient(),
            ConfId:    sConfId,
            ConfName:  sConfName,
            ModuleId:  sModuleId,
            TargetCds: sTargetCds,
            EnvId:     "DEV",
          });
        } catch (e) {
          BusyIndicator.hide();
          console.error("onMaintainPress error:", e);
          MessageBox.error(e?.message || "createRequest failed");
        }
      },
    };
  },
);
