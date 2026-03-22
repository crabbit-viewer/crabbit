use reqwest::Client;
use serde_json::Value;

pub fn build_client() -> Client {
    Client::builder()
        .user_agent("desktop:crabbit:v0.1.0")
        .build()
        .expect("Failed to build HTTP client")
}

pub async fn fetch_listing(
    client: &Client,
    subreddit: &str,
    sort: &str,
    time_range: &str,
    after: Option<&str>,
    limit: u32,
) -> Result<Value, String> {
    let mut url = format!(
        "https://www.reddit.com/r/{}/{}.json?limit={}&raw_json=1",
        subreddit, sort, limit
    );

    if let Some(after_cursor) = after {
        url.push_str(&format!("&after={}", after_cursor));
    }

    if sort == "top" || sort == "controversial" {
        url.push_str(&format!("&t={}", time_range));
    }

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Reddit returned status {}", response.status()));
    }

    response
        .json::<Value>()
        .await
        .map_err(|e| format!("Failed to parse JSON: {}", e))
}
