"use strict";

/*
 * Created with @iobroker/create-adapter v2.3.0
 * ioBroker Adapter to connect to a Charge Amps wallbox
 * 
*/

const utils = require("@iobroker/adapter-core");
const { resolve } = require("path");
const request = require("request");
const { isArray } = require("util");
const { isNumberObject } = require("util/types");

let token = "";
let chargepoints = [];
let statuscode = 0;
let refreshIntervalObject;
let logged_in = false;
let LastSyncDate;
let adapter;

class Chargeamps extends utils.Adapter {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "chargeamps",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
		adapter = this;
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {

		adapter.log.debug("email:" + this.config.email);
		adapter.log.debug("password: ****");
		adapter.log.debug("api-key:" + this.config.apikey);

		await adapter.chargeampsLogin(this.config.email, this.config.password, this.config.apikey).then(() => {
			adapter.log.debug("Started Charge Amps Adapter and logged in successfully");
		});

		const refreshIntervalObject = setInterval(adapter.RefreshChargepoints, this.config.Interval*1000);
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			// clearInterval(interval1);
			adapter.clearInterval(adapter.refreshIntervalObject);
			callback();
		} catch (e) {
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			adapter.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			adapter.log.info(`state ${id} deleted`);
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === "object" && obj.message) {
	// 		if (obj.command === "send") {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info("send command");

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
	// 		}
	// 	}
	// }

	async chargeampsLogin(email, password, apiKey) {
		adapter.log.debug("Login to Chage Amps");
		return new Promise(function(resolve, reject) {
		try {
			const options = {
				method: "POST",
				url: "https://eapi.charge.space/api/v4/auth/login",
				headers: {
					"Content-Type": "application/json",
					apiKey: apiKey,
				},
				body: {
					email: email,
					password: password,
				},
				json: true,
			};
			adapter.log.debug("Options:" + JSON.stringify(options));
			request(options, (error, response, body) => {
				adapter.log.debug("Response:" + JSON.stringify(response));
				adapter.log.debug("Body:" + JSON.stringify(body));
				if (error) reject(error);
				adapter.statuscode = response.statusCode;
				if (adapter.statuscode == 200) {
					adapter.token = body.token;
					adapter.apiKey = apiKey;
					adapter.logged_in = true;
					adapter.chargeampsGetOwnedChargepoints();
					resolve(true);
				} else {
					adapter.logged_in = false;
					adapter.log.error("Login failed");
					adapter.log.error("Statuscode: " + adapter.statuscode);
					resolve(false);
				}
			});
		} catch (error) {
			adapter.log.error(error);					
			resolve(false);
		}
	});
	}

	async SaveValues(key, obj) {
		adapter.log.debug("SaveValues");

		let keys = Object.getOwnPropertyNames(obj);

		adapter.setObjectNotExistsAsync(key, {
			type: "folder",
			common: {
				name: key,
				type: "folder",
			},
			native: {},
		});

		let v;
		for(let i = 0; i<keys.length; i++) {
			if(obj[keys[i]] != null && obj[keys[i]] != undefined) {
			if(typeof obj[keys[i]] === 'object') {
				adapter.log.debug("Object found");
				adapter.SaveValues(key + "." + keys[i], obj[keys[i]]);
			} else {				
				let type = "";
				if (isNaN(obj[keys[i]])) 
				{ 
					type="string"
					v=obj[keys[i]];
				} else if (typeof obj[keys[i]] == "boolean") {
					type="boolean";
					if (obj[keys[i]] === 'true') 
					{
						v = true;
					} else {
						v = false;
					}
				} else { 
					type="number"
					v=parseFloat(obj[keys[i]]);
				};

				adapter.log.debug("Key: "+keys[i]+", Value: "+obj[keys[i]] + ", Type: " + type);
				await adapter.setObjectNotExistsAsync(key+"."+keys[i], {
					type: "state",
					common: {
					name: keys[i],
					role: "value",
					read: true,
					write: true,
					type: type,
					},
					native: {},
				});
				adapter.setState(key+"."+keys[i], { val: v, ack: true });
			}
			}
		}   
	}

	async RefreshChargepoints()
	{
		adapter.log.debug("RefreshChargepoints");
		if(adapter.logged_in) {
		adapter.log.debug("Chargepoints: " + adapter.chargepoints.length);
		for(let x = 0; x<adapter.chargepoints.length; x++) {
			await adapter.chargeampsGetChargepointStatus(adapter.chargepoints[x]);
			if(adapter.statuscode == 401) {
				adapter.log.debug("Token expired, refreshing");
				adapter.logged_in = false;
				var result = await adapter.chargeampsLogin(adapter.email, adapter.password, adapter.apiKey);
			}
		}
	}
	}

	async chargeampsGetOwnedChargepoints() {
		adapter.log.debug("GetOwnedChargepoints");
		const options = {
			method: "GET",
			url: "https://eapi.charge.space/api/v4/chargepoints/owned",
			headers: {
				"Content-Type": "application/json",
				apiKey: adapter.apiKey,
				Authorization: "Bearer " + adapter.token,
			},
			json: true,
		};
		adapter.log.debug("Options:" + JSON.stringify(options));
		request(options, (error, response, body) => {
			adapter.statuscode = response.statusCode;
			adapter.log.debug("Statuscode: " + adapter.statuscode);
			adapter.log.debug("Response:" + JSON.stringify(response));
			if (adapter.statuscode == 200) {
				adapter.log.debug("Body: " + JSON.stringify(body));
				adapter.log.debug("Chargepoints:" + body.length);

				// Refresh chargepoints
				adapter.chargepoints = [];
				for (let x = 0; x < body.length; x++) {
					adapter.chargepoints.push(body[x].id);
					adapter.SaveValues(body[x].name, body[x]);
					adapter.chargeampsGetChargepointSettings(body[x].id);
					adapter.chargeampsGetChargepointStatus(body[x].id);
					adapter.chargeampsGetChargepointSchedules(body[x].id);
					adapter.chargeampsGetChargepointChargingSessions(body[x].id);
					for(let y = 0; y < body[x].connectors.length; y++) {
						adapter.chargeampsGetConnectorSettings(body[x].id, body[x].connectors[y].connectorId);
					}
				}
			}
		});
	}

	async chargeampsGetConnectorSettings(chargepointId, connectorId) {
		adapter.log.debug("chargeampsGetConnectorSettings");
		const options = {
			method: "GET",
			url: "https://eapi.charge.space/api/v4/chargepoints/"+chargepointId+"/connectors/"+connectorId+"/settings",
			headers: {
				"Content-Type": "application/json",
				apiKey: adapter.apiKey,
				Authorization: "Bearer " + adapter.token,
			},
			json: true,
		};
		adapter.log.debug("Options:" + JSON.stringify(options));
		request(options, (error, response, body) => {
			adapter.statuscode = response.statusCode;
			adapter.log.debug("Statuscode: " + adapter.statuscode);
			adapter.log.debug("Response:" + JSON.stringify(response));
			if (adapter.statuscode == 200) {
				adapter.log.debug("Body: " + JSON.stringify(body));
				adapter.SaveValues(chargepointId+".connectors.settings."+connectorId, body);
			}
		});
	}

	async chargeampsGetChargepointSettings(id) {
		adapter.log.debug("chargeampsGetChargepointSettings");
		const options = {
			method: "GET",
			url: "https://eapi.charge.space/api/v4/chargepoints/"+id+"/settings",
			headers: {
				"Content-Type": "application/json",
				apiKey: adapter.apiKey,
				Authorization: "Bearer " + adapter.token,
			},
			json: true,
		};
		adapter.log.debug("Options:" + JSON.stringify(options));
		request(options, (error, response, body) => {
			adapter.statuscode = response.statusCode;
			adapter.log.debug("Statuscode: " + adapter.statuscode);
			adapter.log.debug("Response:" + JSON.stringify(response));
			if (adapter.statuscode == 200) {
				adapter.log.debug("Body: " + JSON.stringify(body));
				adapter.SaveValues(id+".settings", body);
			}
		});
	}

	async chargeampsGetChargepointSchedules(id) {
		adapter.log.debug("chargeampsGetChargepointSchedules");
		const options = {
			method: "GET",
			url: "https://eapi.charge.space/api/v4/chargepoints/"+id+"/schedules",
			headers: {
				"Content-Type": "application/json",
				apiKey: adapter.apiKey,
				Authorization: "Bearer " + adapter.token,
			},
			json: true,
		};
		adapter.log.debug("Options:" + JSON.stringify(options));
		request(options, (error, response, body) => {
			adapter.statuscode = response.statusCode;
			adapter.log.debug("Statuscode: " + adapter.statuscode);
			adapter.log.debug("Response:" + JSON.stringify(response));
			if (adapter.statuscode == 200) {
				adapter.log.debug("Body: " + JSON.stringify(body));
				for(let x = 0; x < body.length; x++) {
					adapter.SaveValues(id+".schedules."+body[x].id, body[x]);
				}
			}
		});
	}

	async chargeampsGetChargepointChargingSessions(id) {
		adapter.log.debug("chargeampsGetChargepointChargingSessions");

		await adapter.setObjectNotExistsAsync(id+".chargingsessions.LastSyncDate", {
			type: "state",
			common: {
			name: LastSyncDate,
			role: "value",
			read: true,
			write: true,
			type: "string",
			},
			native: {},
		});

		adapter.getStateAsync(id+".chargingsessions.LastSyncDate", function (err, state) {

			if (state==null) {
				adapter.LastSyncDate = "2000-01-01T00:00:00.000Z";
			} else {
				adapter.LastSyncDate = state.val;
			}
			adapter.log.debug("chargeampsGetChargepointChargingSessions: sync from "+adapter.LastSyncDate);

			const options = {
				method: "GET",
				url: "https://eapi.charge.space/api/v4/chargepoints/"+id+"/chargingsessions?startTime="+adapter.LastSyncDate,
				headers: {
					"Content-Type": "application/json",
					apiKey: adapter.apiKey,
					Authorization: "Bearer " + adapter.token,
				},
				json: true,
			};
	
			adapter.log.debug("chargeampsGetChargepointChargingSessions: Options:" + JSON.stringify(options));
			request(options, (error, response, body) => {
				adapter.statuscode = response.statusCode;
				adapter.log.debug("chargeampsGetChargepointChargingSessions: Statuscode: " + adapter.statuscode);
				adapter.log.debug("chargeampsGetChargepointChargingSessions: Response:" + JSON.stringify(response));
				if (adapter.statuscode == 200) {
					adapter.log.debug("Body: " + JSON.stringify(body));
					for(let x = 0; x < body.length; x++) {
						if (adapter.LastSyncDate < new Date(body[x].startTime)) {
							adapter.LastSyncDate = new Date(body[x].startTime);
						}
					}
					adapter.setObjectNotExistsAsync(id+".chargingsessions.LastSyncDate", {
						type: "state",
						common: {
						name: "LastSyncDate",
						role: "value",
						read: true,
						write: true,
						type: "string",
						},
						native: {},
					});

				adapter.setState(id+".chargingsessions.LastSyncDate", { val: adapter.LastSyncDate, ack: true });
				}
	
				for(let x = 0; x < body.length; x++) {
					adapter.SaveValues(id+".chargingsessions."+body[x].id, body[x]);
				}
			});
	

		});
	}

	async chargeampsGetChargepointStatus(id) {
		adapter.log.debug("chargeampsGetChargepointStatus for "+id);
		const options = {
			method: "GET",
			url: "https://eapi.charge.space/api/v4/chargepoints/"+id+"/status",
			headers: {
				"Content-Type": "application/json",
				apiKey: adapter.apiKey,
				Authorization: "Bearer " + adapter.token,
			},
			json: true,
		};
		adapter.log.debug("Options:" + JSON.stringify(options));
		request(options, (error, response, body) => {
			statuscode = response.statusCode;
			adapter.log.debug("Statuscode: " + adapter.statuscode);
			adapter.log.debug("Response:" + JSON.stringify(response));
			if (adapter.statuscode == 200) {
				adapter.log.debug("Body: " + JSON.stringify(body));
				for(let x = 0; x < body.connectorStatuses.length; x++) {
					let ChargePointId = body.connectorStatuses[x].chargePointId;
					let ConnectorId = body.connectorStatuses[x].connectorId;
					if(body.connectorStatuses[x].measurements==null) {
						adapter.log.debug("No measurements, set to 0");
						body.connectorStatuses[x].measurements = [];
						body.connectorStatuses[x].measurements.push({"phase": "L1", "current": "0", "voltage": "0"});
						body.connectorStatuses[x].measurements.push({"phase": "L2", "current": "0", "voltage": "0"});
						body.connectorStatuses[x].measurements.push({"phase": "L3", "current": "0", "voltage": "0"});
					}
					adapter.log.debug("Save values :"+body.connectorStatuses[x].measurements[0].current+ " / " +body.connectorStatuses[x].measurements[1].current+ " / "+ +body.connectorStatuses[x].measurements[2].current);
					adapter.SaveValues(id+".connectors.status."+ConnectorId, body.connectorStatuses[x]);							
				}		
			}
		});
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Chargeamps(options);
} else {
	// otherwise start the instance directly
	new Chargeamps();
}
