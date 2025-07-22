fetch("https://www.wholefoodsmarket.com/store-affinity", {
    headers: {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9",
        "anti-csrftoken-a2z": "g8vLu/dZWzjCsJDFVrLrpFVhPtr6MUjMo2ijQsM2pdUFAAAAAQAAAABodo6GcmF3AAAAACr/Igfie4qiUf9rqj+gAw==",
        "content-type": "text/plain;charset=UTF-8",
        "device-memory": "8",
        "downlink": "10",
        "dpr": "1.5",
        "ect": "4g",
        "rtt": "100",
        "sec-ch-device-memory": "8",
        "sec-ch-dpr": "1.5",
        "sec-ch-ua": "\"Not)A;Brand\";v=\"8\", \"Chromium\";v=\"138\", \"Google Chrome\";v=\"138\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-ch-viewport-width": "448",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "viewport-width": "448"
    },
    referrer: "https://www.wholefoodsmarket.com/",
    body: JSON.stringify({"storeId":"10373"}),  //this is where we switch the store
    method: "PUT",
    mode: "cors",
    credentials: "include"
})
