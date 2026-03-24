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

          // 6. Navigate to CatalogLanding — user will edit title + reason in MM Routes
          const sClient = _getSapClient();
          window.open(
            "http://localhost:8082/test/flp.html" +
              "?sap-ui-xx-viewCache=false" +
              "&sap-client=" + sClient +
              "&ConfId="    + encodeURIComponent(sConfId) +
              "&ConfName="  + encodeURIComponent(sConfName) +
              "&ModuleId="  + encodeURIComponent(sModuleId) +
              "&TargetCds=" + encodeURIComponent(sTargetCds) +
              "&EnvId=DEV" +
              "#app-preview",
            "_self",
          );
        } catch (e) {
          BusyIndicator.hide();
          console.error("onMaintainPress error:", e);
          MessageBox.error(e?.message || "createRequest failed");
        }
      },
    };
  },
);
