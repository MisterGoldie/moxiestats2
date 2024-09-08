import { Button, Frog } from 'frog';
import { handle } from 'frog/vercel';
import fetch from 'node-fetch';
import { neynar } from 'frog/middlewares';

const AIRSTACK_API_URL = 'https://api.airstack.xyz/gql';
const AIRSTACK_API_KEY = '103ba30da492d4a7e89e7026a6d3a234e';
const WIELD_API_KEY = '940MO-E2WU4-HM4DF-KLMZ9B'; // Make sure WIELD_API_KEY is correctly set
const FRAME_CAST_HASH = process.env.FRAME_CAST_HASH || '0xeb809faa'; // Ensure FRAME_CAST_HASH is set properly

console.log('Current FRAME_CAST_HASH:', FRAME_CAST_HASH);

export const app = new Frog({
  basePath: '/api',
  imageOptions: { width: 1200, height: 630 },
  title: '$MOXIE Earnings Tracker',
}).use(
  neynar({
    apiKey: 'NEYNAR_FROG_FM', // Make sure Neynar API key is set correctly
    features: ['interactor', 'cast'],
  })
);

interface MoxieUserInfo {
  profileName: string | null;
  profileImage: string | null;
  todayEarnings: string;
  lifetimeEarnings: string;
  farScore: number | null;
}

// Replacing the old hasLikedAndRecasted function with the updated version
async function hasLikedAndRecasted(fid: string): Promise<boolean> {
  try {
    // First, try the Wield API
    const result = await checkWieldAPI(fid);
    return result;
  } catch (error) {
    console.error('Error with Wield API, falling back to Neynar:', error);
    // If Wield API fails, try Neynar API
    try {
      const result = await checkNeynarAPI(fid);
      return result;
    } catch (neynarError) {
      console.error('Error with Neynar API:', neynarError);
      return false; // If both APIs fail, assume no interaction
    }
  }
}

// Function to check interactions using the Wield API
async function checkWieldAPI(fid: string): Promise<boolean> {
  const url = `https://api.wield.xyz/v1/reactions?castHash=${FRAME_CAST_HASH}&fid=${fid}`;
  const options = {
    method: 'GET',
    headers: {
      'accept': 'application/json',
      'x-api-key': WIELD_API_KEY,
    },
  };

  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Wield API responded with status ${response.status}`);
  }

  const data = await response.json();
  console.log('Wield API response:', JSON.stringify(data, null, 2));

  if (!data || (!data.likes && !data.recasts)) {
    console.error('Unexpected Wield API response structure:', data);
    return false;
  }

  const hasLiked = data.likes && data.likes.length > 0;
  const hasRecasted = data.recasts && data.recasts.length > 0;

  console.log(`User ${fid} has liked: ${hasLiked}, has recasted: ${hasRecasted}`);

  return hasLiked || hasRecasted;
}

// Function to check interactions using the Neynar API
async function checkNeynarAPI(fid: string): Promise<boolean> {
  const NEYNAR_API_KEY = 'NEYNAR_API_DOCS'; // Replace with your actual Neynar API key
  const url = `https://api.neynar.com/v2/farcaster/reactions/cast?hash=${FRAME_CAST_HASH}&types=likes%2Crecasts&limit=50`;
  const options = {
    method: 'GET',
    headers: { accept: 'application/json', api_key: NEYNAR_API_KEY },
  };

  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Neynar API responded with status ${response.status}`);
  }

  const data = await response.json();
  console.log('Neynar API response:', JSON.stringify(data, null, 2));

  const userLiked = data.likes.some((like: any) => like.reactor.fid.toString() === fid.toString());
  const userRecast = data.recasts.some((recast: any) => recast.recaster.fid.toString() === fid.toString());

  console.log(`User ${fid} has liked: ${userLiked}, has recasted: ${userRecast}`);

  return userLiked || userRecast;
}

async function getMoxieUserInfo(fid: string): Promise<MoxieUserInfo> {
  console.log(`Fetching info for FID: ${fid}`);

  const query = `
    query MoxieEarnings($fid: String!) {
      socialInfo: Socials(
        input: {filter: {dappName: {_eq: farcaster}, userId: {_eq: $fid}}, blockchain: ethereum}
      ) {
        Social {
          profileName
          profileImage
          farcasterScore {
            farScore
          }
        }
      }
      todayEarnings: FarcasterMoxieEarningStats(
        input: {timeframe: TODAY, blockchain: ALL, filter: {entityType: {_eq: USER}, entityId: {_eq: $fid}}}
      ) {
        FarcasterMoxieEarningStat {
          allEarningsAmount
        }
      }
      lifetimeEarnings: FarcasterMoxieEarningStats(
        input: {timeframe: LIFETIME, blockchain: ALL, filter: {entityType: {_eq: USER}, entityId: {_eq: $fid}}}
      ) {
        FarcasterMoxieEarningStat {
          allEarningsAmount
        }
      }
    }
  `;

  const variables = { fid: fid };

  try {
    console.log('Sending query to Airstack API...');
    const response = await fetch(AIRSTACK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': AIRSTACK_API_KEY,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API error:', response.status, errorText);
      throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
    }

    const data = await response.json();
    console.log('API response data:', JSON.stringify(data, null, 2));

    if (data.errors) {
      console.error('GraphQL Errors:', data.errors);
      throw new Error('GraphQL errors in the response');
    }

    const socialInfo = data.data?.socialInfo?.Social?.[0] || {};
    const todayEarnings = data.data?.todayEarnings?.FarcasterMoxieEarningStat?.[0]?.allEarningsAmount || '0';
    const lifetimeEarnings = data.data?.lifetimeEarnings?.FarcasterMoxieEarningStat?.[0]?.allEarningsAmount || '0';
    const farScore = socialInfo.farcasterScore?.farScore || null;

    return {
      profileName: socialInfo.profileName || null,
      profileImage: socialInfo.profileImage || null,
      todayEarnings: todayEarnings,
      lifetimeEarnings: lifetimeEarnings,
      farScore: farScore,
    };
  } catch (error) {
    console.error('Detailed error in getMoxieUserInfo:', error);
    throw error;
  }
}

app.frame('/', (c) => {
  const backgroundImageUrl = 'https://amaranth-adequate-condor-278.mypinata.cloud/ipfs/QmNa4UgwGS1LZFCFqQ8yyPkLZ2dHomUh1WyrmEFkv3TY2s';

  return c.res({
    image: (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        backgroundImage: `url(${backgroundImageUrl})`,
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#E7C4E1',
      }} />
    ),
    intents: [
      <Button action="/check">Check stats</Button>,
    ],
  });
});

app.frame('/check', async (c) => {
  const { fid } = c.frameData?.fid ? c.frameData : (c.req.query() || {});
  const { displayName, pfpUrl } = c.var?.interactor || {};

  if (!fid) {
    console.error('No FID found in frameData or query params');
    return c.res({
      image: (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', backgroundColor: '#E7C4E1' }}>
          <h1 style={{ fontSize: '36px', marginBottom: '20px', color: 'black' }}>Error: No FID</h1>
        </div>
      ),
      intents: [
        <Button action="/">Back</Button>
      ]
    });
  }

  const hasInteracted = await hasLikedAndRecasted(fid.toString());

  if (!hasInteracted) {
    return c.res({
      image: (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', backgroundColor: '#E7C4E1' }}>
          <h1 style={{ fontSize: '50px', marginBottom: '20px', color: 'black' }}>Please like or recast</h1>
          <p style={{ fontSize: '40px', color: 'black', textAlign: 'center' }}>You need to like or recast this frame to view your $MOXIE stats.</p>
        </div>
      ),
      intents: [
        <Button action="/">Back</Button>,
        <Button action="/check">Check again</Button>
      ]
    });
  }

  let userInfo: MoxieUserInfo | null = null;
  let errorMessage = '';

  try {
    userInfo = await getMoxieUserInfo(fid.toString());
  } catch (error) {
    console.error('Error in getMoxieUserInfo:', error);
    errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
  }

  const backgroundImageUrl = 'https://amaranth-adequate-condor-278.mypinata.cloud/ipfs/QmPEucEh1aDvSUeiFV3pgTcxqhYXbrADSuixd8wMkUqSrw';

  try {
    return c.res({
      image: (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          width: '100%', 
          height: '100%', 
          backgroundImage: `url(${backgroundImageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          padding: '20px', 
          boxSizing: 'border-box',
          position: 'relative'
        }}>
          <div style={{
            position: 'absolute',
            top: '30px',
            left: '20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}>
            {pfpUrl ? (
              <img 
                src={pfpUrl} 
                alt="Profile" 
                style={{ 
                  width: '150px', 
                  height: '150px', 
                  borderRadius: '50%',
                  border: '3px solid black'
                }}
              />
            ) : (
              <div style={{ 
                width: '150px', 
                height: '150px', 
                borderRadius: '50%', 
                backgroundColor: '#ccc', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                border: '3px solid black',
                fontSize: '90px',
                color: '#333'
              }}>
                {displayName ? displayName.charAt(0).toUpperCase() : 'U'}
              </div>
            )}
            <p style={{ 
              fontSize: '26px', 
              marginTop: '10px', 
              color: 'black', 
              textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
            }}>
              FID: {fid}
            </p>
            {userInfo && userInfo.farScore !== null && (
              <p style={{ 
                fontSize: '24px', 
                marginTop: '5px', 
                color: 'black', 
                textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
              }}>
                Farscore: {userInfo.farScore.toFixed(2)}
              </p>
            )}
          </div>
          
          {errorMessage ? (
            <p style={{ fontSize: '38px', color: 'red', textShadow: '1px 1px 2px rgba(0,0,0,0.5)' }}>Error: {errorMessage}</p>
          ) : userInfo ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <p style={{ fontSize: '42px', marginBottom: '10px', color: 'black', textShadow: '1px 1px 2px rgba(0,0,0,0.5)' }}>
                {Number(userInfo.todayEarnings).toFixed(2)} $MOXIE today
              </p>
              <p style={{ fontSize: '42px', marginBottom: '10px', color: 'black', textShadow: '1px 1px 2px rgba(0,0,0,0.5)' }}>
                {Number(userInfo.lifetimeEarnings).toFixed(2)} $MOXIE all-time
              </p>
            </div>
          ) : (
            <p style={{ fontSize: '32px', color: 'black', textShadow: '1px 1px 2px rgba(0,0,0,0.5)' }}>No user data available</p>
          )}
        </div>
      ),
      intents: [
        <Button action="/">Back</Button>,
        <Button action="/check">Refresh</Button>,
      ]
    });
  } catch (renderError) {
    console.error('Error rendering frame:', renderError);
    return c.res({
      image: (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', backgroundColor: '#1DA1F2' }}>
          <h1 style={{ fontSize: '60px', marginBottom: '20px', color: 'black' }}>Render Error</h1>
          <p style={{ fontSize: '50px', textAlign: 'center', color: 'black' }}>
            {renderError instanceof Error ? renderError.message : 'An unknown error occurred during rendering'}
          </p>
        </div>
      ),
      intents: [
        <Button action="/">Back</Button>,
        <Button action="/check">Retry</Button>
      ]
    });
  }
});

export const GET = handle(app);
export const POST = handle(app);
