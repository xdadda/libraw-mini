export class LibRaw {
	constructor() {
		return (async()=>{
			this.worker = new Worker('./libraw-mini-worker.js', {type:"module"});
			this.waitForWorker = false;
			this.worker.onmessage = ({data}) => {
				if(data?.out?.cb && this.cb) return this.cb(data.out.count,data.out.msg);				
				if(this.waitForWorker) {
					let {"return": ret, "error": thr} = this.waitForWorker;
					this.waitForWorker = false;
					if(data?.error) {
						thr(data.error);
					} else {
						ret(data?.out);
					}
				}
			};
			//await for worker to post 'ready' message
			let prom = new Promise((res, err)=>{this.waitForWorker = {error: err,return: res,};});
			await prom;
			return this;
		})()

	}
	
	async runFn(fn, ...args) {
		//console.log('runFn',fn)
		let prom = new Promise((res, err)=>{this.waitForWorker = {error: err,return: res,};});
		this.worker.postMessage({fn, args}, args.map(a=>{
			if([ArrayBuffer, Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array].some(b=>a instanceof b)) { // Transfer buffer
				return a.buffer;
			}
		}).filter(a=>a));
		return await prom;
	}

	async init() {
		return await this.runFn('init', null, null);
	}
	async open(buffer, settings) {
		return await this.runFn('open', buffer, settings);
	}
    async close() {
        return await this.runFn('close', null, null);
    }
    async getimage(cb=null) {
		if(cb) this.cb=cb
        return await this.runFn('get_image', null, null);
    }
    async getthumbnail() {
        return await this.runFn('get_thumb', null, null);
    }
	async getmetadata() {
		return await this.runFn('get_metadata', null, null);
	}
	async setparams(params) {
		return await this.runFn('set_params', params, null);
	}
	async version() {
		return await this.runFn('version', null, null);
	}

}
