module.exports = class encoderTCP extends require('node:events')
{
    constructor()
    {
        super();
        this.__queueBuffer = [];
        this.__ready = false;
    }


    async searchPack(buffer)
    {
        if(!buffer || !Buffer.isBuffer(buffer))return false;
        const start = buffer.indexOf();
        if(start === -1){
            return {buffer: buffer, start: -1, end: -1};
        }
        buffer = buffer.slice(start);
    }

    ready()
    {
        if(this.__ready) return false;
        this.__ready = true;
        const buffer = this.__queueBuffer.shift();
        if(!buffer || !Buffer.isBuffer(buffer))return false;



        this.__ready = false;
    }

    append(buffer)
    {
        if(!buffer || !Buffer.isBuffer(buffer)) return false;
        this.__queueBuffer.push(buffer);
        this.emit('append', buffer);
        return true;
    }



}