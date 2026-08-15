const { execSync, spawn } = require('child_process');
const fs = require('fs');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log("| Concurrency Level | Avg Response Time | p95 Response Time | Requests/sec | Error Rate | Peak CPU | Peak RAM | DB Connections |");
  console.log("|-------------------|-------------------|-------------------|--------------|------------|----------|----------|----------------|");

  for (const vus of [20, 50, 100, 150]) {
    const arrivalRate = Math.max(Math.round(vus / 2), 1);
    const env = { 
      ...process.env, 
      ARRIVAL_RATE: arrivalRate.toString(),
      BASE_URL: 'http://localhost:3012',
      LOAD_TEST_SECRET: 'supersecret'
    };
    
    const art = spawn('artillery', ['run', '-e', 'prod', '/root/artillery-ws.yml', '--output', `/tmp/report_${vus}.json`], { env });
    
    let peakCpu = 0;
    let peakRam = 0;
    let peakDb = 0;
    
    const monitorInterval = setInterval(() => {
      try {
        const topOut = execSync("top -b -n 1 | grep node | head -n 1").toString();
        const parts = topOut.trim().split(/\s+/);
        if (parts.length > 8) {
          const cpu = parseFloat(parts[8]);
          if (!isNaN(cpu) && cpu > peakCpu) peakCpu = cpu;
          // RAM in KB/MB? VIRT RES SHR. RES is usually 6th col
          const res = parts[5]; 
          let ramMb = 0;
          if (res.includes('g')) ramMb = parseFloat(res) * 1024;
          else if (res.includes('m')) ramMb = parseFloat(res);
          else ramMb = parseFloat(res) / 1024;
          if (!isNaN(ramMb) && ramMb > peakRam) peakRam = ramMb;
        }
        
        const dbConns = parseInt(execSync("netstat -an | grep 5432 | wc -l").toString().trim(), 10);
        if (dbConns > peakDb) peakDb = dbConns;
      } catch (e) {}
    }, 2000);

    // Wait for artillery to finish (or kill after 60s)
    let finished = false;
    art.on('close', () => { finished = true; });
    
    let elapsed = 0;
    while (!finished && elapsed < 60) {
      await sleep(1000);
      elapsed++;
    }
    
    clearInterval(monitorInterval);
    if (!finished) art.kill();

    await sleep(1000); // let file flush

    let avgResp = "N/A";
    let p95Resp = "N/A";
    let reqSec = "N/A";
    let errRate = "N/A";

    try {
      const data = JSON.parse(fs.readFileSync(`/tmp/report_${vus}.json`, 'utf8'));
      const metrics = data.aggregate.summaries;
      const counters = data.aggregate.counters;
      const rates = data.aggregate.rates;

      if (metrics['http.response_time']) {
        avgResp = Math.round(metrics['http.response_time'].mean) + 'ms';
        p95Resp = Math.round(metrics['http.response_time'].p95) + 'ms';
      }
      
      const totalReq = counters['http.requests'] || 0;
      const totalCodes = counters['http.codes.200'] || 0;
      const totalErrors = counters['errors.Error: xhr poll error'] || 0;
      const rate = rates['http.request_rate'] || totalReq / elapsed;
      reqSec = Math.round(rate) + ' req/s';
      
      const errRatio = totalReq > 0 ? ((totalReq - totalCodes) / totalReq) * 100 : 0;
      errRate = Math.round(errRatio) + '%';
    } catch (e) {
      errRate = 'Failed to parse';
    }

    console.log(`| **${vus} VUs** | ${avgResp} | ${p95Resp} | ${reqSec} | **${errRate}** | ${peakCpu.toFixed(1)}% | ${Math.round(peakRam)}MB | ${peakDb} |`);
  }
}

run().catch(console.error);
