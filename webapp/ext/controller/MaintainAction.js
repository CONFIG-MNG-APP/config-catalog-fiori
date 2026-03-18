sap.ui.define(
  [
    "sap/m/MessageBox",
    "sap/ui/core/BusyIndicator",
    "sap/ui/model/odata/v4/ODataModel",
  ],
  function (MessageBox, BusyIndicator, ODataModel) {
    "use strict";

    let _oReqModel = null;

    function getReqModel() {
      if (!_oReqModel) {
        const sSapClient =
          new URLSearchParams(window.location.search).get("sap-client") ||
          "324";

        _oReqModel = new ODataModel({
          serviceUrl:
            "/sap/opu/odata4/sap/zui_conf_req/srvd/sap/zsd_conf_req/0001/?sap-client=" +
            sSapClient,
          synchronizationMode: "None",
          operationMode: "Server",
          autoExpandSelect: true,
        });
      }
      return _oReqModel;
    }

    // Fetch CSRF token từ service trước khi gọi action
    async function fetchCsrfToken(sServiceUrl) {
      const oResponse = await fetch(sServiceUrl, {
        method: "GET",
        headers: {
          "X-CSRF-Token": "Fetch",
          "X-Requested-With": "XMLHttpRequest",
        },
        credentials: "include",
      }); // THÊM ĐOẠN NÀY
      const sRawBody = await oResponse.text();
      console.log("Response status:", oResponse.status);
      console.log("Response body:", sRawBody);

      if (!oResponse.ok) {
        // parse sau khi đã log
        let oErr = {};
        try {
          oErr = JSON.parse(sRawBody);
        } catch {}
        MessageBox.error(oErr?.error?.message || "Error " + oResponse.status);
        return;
      }

      return oResponse.headers.get("X-CSRF-Token") || "";
    }

    return {
      onMaintainPress: async function (oContext) {
        try {
          // ── 1. Lấy binding context ──
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

          // ── 2. Đọc data từ catalog ──
          const oData = await oBindingContext.requestObject();
          const sConfId = oData?.ConfId || "";
          const sModuleId = oData?.ModuleId || "";
          const sConfName = oData?.ConfName || "";
          const sTargetCds = oData?.TargetCds || "";

          console.log("ConfId:", sConfId);

          if (!sConfId) {
            MessageBox.error("ConfId is missing");
            return;
          }

          BusyIndicator.show(0);

          // ── 3. Fetch CSRF token ──
          const sSapClient =
            new URLSearchParams(window.location.search).get("sap-client") ||
            "324";

          const sServiceUrl =
            "/sap/opu/odata4/sap/zui_conf_req/srvd/sap/zsd_conf_req/0001/?sap-client=" +
            sSapClient;
          const sCsrfToken = await fetchCsrfToken(sServiceUrl);

          console.log("CSRF Token:", sCsrfToken);

          if (!sCsrfToken) {
            BusyIndicator.hide();
            MessageBox.error("Không lấy được CSRF token");
            return;
          }

          // ── 4. Gọi action bằng fetch trực tiếp (chắc chắn nhất) ──
          const sActionUrl =
            "/sap/opu/odata4/sap/zui_conf_req/srvd/sap/zsd_conf_req/0001/" +
            "ZC_CONF_REQ_H/" +
            "com.sap.gateway.srvd.zsd_conf_req.v0001.createRequest" +
            "?sap-client=" +
            sSapClient;

          console.log("Action URL:", sActionUrl);
          const oBody = {
            ConfId: sConfId,
            ModuleId: sModuleId,
            ConfName: sConfName,
            TargetCds: sTargetCds,
            ActionType: "CREATE",
            TargetEnvId: "DEV",
            Reason: "",
            Notes: "",
          };
          const sBodyStr = JSON.stringify(oBody);
          console.log("=== POST body ===", sBodyStr);
          console.log("ConfId type:", typeof sConfId, "value:", sConfId);
          console.log("ConfId length:", sConfId.length);
          const oResponse = await fetch(sActionUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": sCsrfToken,
              "X-Requested-With": "XMLHttpRequest",
              Accept: "application/json",
            },
            credentials: "include",
            body: JSON.stringify(oBody),
          });

          BusyIndicator.hide();

          if (!oResponse.ok) {
            const oErr = await oResponse.json().catch(() => ({}));
            const sMsg =
              oErr?.error?.message ||
              "createRequest failed: " + oResponse.status;
            MessageBox.error(sMsg);
            return;
          }
          // Đọc response
          const oResult = await oResponse.json();
          console.log("createRequest result:", JSON.stringify(oResult));
          const oFirst = Array.isArray(oResult?.value)
            ? oResult.value[0]
            : oResult?.value || oResult;

          const sReqId = oFirst?.ReqId || "";
          const sTargetApp = oFirst?.TargetApp || "";

          console.log("ReqId:", sReqId, "TargetApp:", sTargetApp);

          if (!sReqId) {
            MessageBox.error("createRequest không trả về ReqId");
            return;
          }

          // ── 5. Navigate ──
          const sUrl =
            "http://localhost:8082/test/flp.html" +
            "?sap-client=" +
            sSapClient +
            "&sap-ui-xx-viewCache=false" +
            "&ReqId=" +
            encodeURIComponent(sReqId) +
            "&TargetApp=" +
            encodeURIComponent(sTargetApp) +
            "&mode=edit" +
            "#app-preview";

          console.log("Navigate to:", sUrl);
          window.location.href = sUrl;
        } catch (e) {
          BusyIndicator.hide();
          console.error("onMaintainPress error:", e);
          MessageBox.error(e?.message || "createRequest failed");
        }
      },
    };
  },
);
