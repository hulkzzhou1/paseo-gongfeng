import assert from "node:assert/strict";
import { test } from "node:test";
import { avatarUrl } from "./avatar.ts";

test("头像接受 HTTPS、站点相对地址和工蜂无协议地址，拒绝凭据及非图片 URL 协议", () => {
  const site = "https://code.example.com";
  for (const value of ["/uploads/avatar.png", "code.example.com/uploads/avatar.png", `${site}/uploads/avatar.png`]) assert.equal(avatarUrl(value, site), `${site}/uploads/avatar.png`);
  assert.equal(avatarUrl("https://images.example.com/avatar.png", site), "https://images.example.com/avatar.png");
  for (const value of [null, "", {}, "http://images.example.com/a", "data:image/png,abc", "javascript:alert(1)", "https://user:secret@example.com/a", "/a?private_token=secret", "/a#secret", "/a b", "\\\\example.com/a"]) assert.equal(avatarUrl(value, site), null);
});
