sap.ui.define(
  ["sap/m/MessageBox", "sap/ui/core/BusyIndicator"],
  function (MessageBox, BusyIndicator) {
    "use strict";

    // P3-12: Đọc sap-client từ runtime, fallback rỗng (không hardcode 324)
    function _getSapClient() {
      return new URLSearchParams(window.location.search).get("sap-client") || "";
    }

    function _appendClient(sUrl, bFirst) {
      const sClient = _getSapClient();
      if (!sClient) return sUrl;
      return sUrl + (bFirst ? "?" : "&") + "sap-client=" + sClient;
    }

    const BASE_SVC =
      "/sap/opu/odata4/sap/zui_conf_req/srvd/sap/zsd_conf_req/0001/";

    function _getReqServiceUrl() {
      return _appendClient(BASE_SVC, true);
    }

    function _mapTargetApp(sTargetCds) {
      const oMap = {
        ZI_MM_ROUTE_CONF: "MM_ROUTE_REQ",
        ZI_MM_SAFE_STOCK: "MM_SAFE_REQ",
        ZI_SD_PRICE_CONF: "SD_PRICE_REQ",
        ZI_FI_LIMIT_CONF: "FI_LIMIT_REQ",
      };
      return oMap[sTargetCds] || "CONF_REQ";
    }

    // P0-3: fetch với AbortController timeout
    async function _fetchWithTimeout(sUrl, oOptions, iTimeoutMs) {
      const oCtrl = new AbortController();
      const iTimer = setTimeout(() => oCtrl.abort(), iTimeoutMs || 15000);
      try {
        return await fetch(sUrl, { ...oOptions, signal: oCtrl.signal });
      } finally {
        clearTimeout(iTimer);
      }
    }

    async function _fetchCsrfToken(sServiceUrl) {
      const oResp = await _fetchWithTimeout(
        sServiceUrl,
        {
          method: "GET",
          headers: {
            "X-CSRF-Token": "Fetch",
            "X-Requested-With": "XMLHttpRequest",
          },
          credentials: "include",
        },
        10000
      );
      if (!oResp.ok) return null;
      return oResp.headers.get("X-CSRF-Token") || null;
    }

    // P0-6: bỏ tham số sCsrfToken không dùng
    // P0-1: encodeURIComponent cho sConfId trong $filter
    // P0-5: thử lại tối đa 3 lần khi query thất bại
    async function _queryNewReqId(sConfId) {
      const sUrl = _appendClient(
        BASE_SVC +
          "ZC_CONF_REQ_H" +
          "?$filter=ConfId eq " + encodeURIComponent(sConfId) +
          "&$orderby=CreatedAt desc" +
          "&$top=1" +
          "&$select=ReqId,ConfId,ModuleId"
      );

      const MAX_RETRIES = 3;
      for (let i = 0; i < MAX_RETRIES; i++) {
        try {
          const oResp = await _fetchWithTimeout(
            sUrl,
            {
              method: "GET",
              headers: {
                Accept: "application/json",
                "X-Requested-With": "XMLHttpRequest",
              },
              credentials: "include",
            },
            10000
          );
          if (oResp.ok) {
            const oData = await oResp.json();
            const aResults = oData?.value || [];
            if (aResults.length > 0) return aResults[0];
          }
        } catch (e) {
          if (i === MAX_RETRIES - 1) throw e;
        }
        await new Promise((res) => setTimeout(res, 500));
      }
      return null;
    }

    // P0-2: chống bấm trùng
    let _bPending = false;

    return {
      onMaintainPress: async function (oContext) {
        // P0-2: nếu đang xử lý thì bỏ qua
        if (_bPending) return;
        _bPending = true;

        try {
          // 1. Binding context
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

          // 2. Đọc catalog data
          const oData = await oBindingContext.requestObject();
          const sConfId    = oData?.ConfId    || "";
          const sModuleId  = oData?.ModuleId  || "";
          const sConfName  = oData?.ConfName  || "";
          const sTargetCds = oData?.TargetCds || "";

          if (!sConfId) {
            MessageBox.error("ConfId is missing");
            return;
          }

          BusyIndicator.show(0);

          // 3. CSRF token (với timeout)
          const sCsrfToken = await _fetchCsrfToken(_getReqServiceUrl());
          if (!sCsrfToken) {
            BusyIndicator.hide();
            MessageBox.error("Cannot fetch CSRF token");
            return;
          }

          // 4. Call createRequest (với timeout)
          const sActionUrl = _appendClient(
            BASE_SVC +
              "ZC_CONF_REQ_H/" +
              "com.sap.gateway.srvd.zsd_conf_req.v0001.createRequest"
          );

          const oBody = {
            ConfId:      sConfId,
            ModuleId:    sModuleId,
            ConfName:    sConfName,
            TargetCds:   sTargetCds,
            ActionType:  "CREATE",
            TargetEnvId: "DEV",
            Reason:      "",
            Notes:       "",
          };

          let oResponse;
          try {
            oResponse = await _fetchWithTimeout(
              sActionUrl,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-CSRF-Token": sCsrfToken,
                  "X-Requested-With": "XMLHttpRequest",
                  Accept: "application/json",
                },
                credentials: "include",
                body: JSON.stringify(oBody),
              },
              20000
            );
          } catch (eFetch) {
            BusyIndicator.hide();
            MessageBox.error(
              eFetch.name === "AbortError"
                ? "Request timed out. Please try again."
                : "Network error: " + eFetch.message
            );
            return;
          }

          if (!oResponse.ok) {
            BusyIndicator.hide();
            // P0-4: parse lỗi an toàn — không crash nếu body không phải JSON
            const sErrText = await oResponse.text().catch(() => "");
            let sErrMsg = "createRequest failed: " + oResponse.status;
            try {
              const oErr = JSON.parse(sErrText);
              if (oErr?.error?.message) sErrMsg = oErr.error.message;
            } catch (_) { /* không phải JSON, dùng fallback */ }
            MessageBox.error(sErrMsg);
            return;
          }

          // 5. Query ReqId mới (có thử lại)
          const oNewReq = await _queryNewReqId(sConfId);
          BusyIndicator.hide();

          if (!oNewReq?.ReqId) {
            MessageBox.error("Request created but could not retrieve ReqId");
            return;
          }

          const sReqId = oNewReq.ReqId;
          const sTargetApp = _mapTargetApp(sTargetCds);

          // 6. Navigate sang conf-header-item kèm params
          const sReqUrl =
            "http://localhost:8082/test/flp.html" +
            "?sap-ui-xx-viewCache=false" +
            "&ConfId="    + encodeURIComponent(sConfId) +
            "&ConfName="  + encodeURIComponent(sConfName) +
            "&ModuleId="  + encodeURIComponent(sModuleId) +
            "&TargetCds=" + encodeURIComponent(sTargetCds) +
            "&TargetApp=" + encodeURIComponent(sTargetApp) +
            "#app-preview&/ZC_CONF_REQ_H(ReqId=" + sReqId + ",IsActiveEntity=true)";

          const oLink = document.createElement("a");
          oLink.href = sReqUrl;
          oLink.target = "_blank";
          oLink.rel = "noopener noreferrer";
          document.body.appendChild(oLink);
          oLink.click();
          document.body.removeChild(oLink);

        } catch (e) {
          BusyIndicator.hide();
          MessageBox.error(e?.message || "createRequest failed");
        } finally {
          // P0-2: luôn reset flag dù thành công hay lỗi
          _bPending = false;
        }
      },
    };
  }
);
