local ESX = exports['es_extended']:getSharedObject()

local pending = {}
local cache = {}
local sending = false

local function getDiscord(src)
  for _, id in ipairs(GetPlayerIdentifiers(src)) do
    if id:sub(1, 8) == 'discord:' then
      return id:sub(9)
    end
  end
  return nil
end

local function snapshot(src, online)
  local xPlayer = ESX.GetPlayerFromId(src)
  if not xPlayer then return nil end
  local discord = getDiscord(src)
  if not discord then return nil end
  return {
    discord = discord,
    identifier = xPlayer.identifier,
    name = GetPlayerName(src) or '',
    job = xPlayer.job.name,
    grade = xPlayer.job.grade,
    online = online,
  }
end

local function mark(src, online)
  local p = snapshot(src, online)
  if p then
    pending[p.discord] = p
    cache[src] = p
  end
end

local function headers()
  return {
    ['Content-Type'] = 'application/json',
    ['Authorization'] = 'Bearer ' .. Config.SyncToken,
  }
end

local function jobsCatalog()
  local out = {}
  for name, job in pairs(ESX.GetJobs()) do
    local grades = {}
    for _, g in pairs(job.grades or {}) do
      grades[#grades + 1] = { grade = tonumber(g.grade), label = g.label or g.name }
    end
    out[#out + 1] = { name = name, label = job.label or name, grades = grades }
  end
  return out
end

AddEventHandler('esx:playerLoaded', function(src) mark(src, true) end)
AddEventHandler('esx:setJob', function(src) mark(src, true) end)
AddEventHandler('playerDropped', function()
  local src = source
  local p = cache[src]
  if p then
    p.online = false
    pending[p.discord] = p
    cache[src] = nil
  end
end)

CreateThread(function()
  while true do
    Wait(Config.FlushInterval)
    if not sending and next(pending) ~= nil then
      local batch = {}
      for _, p in pairs(pending) do batch[#batch + 1] = p end
      pending = {}
      sending = true
      PerformHttpRequest(Config.SyncUrl, function(status)
        sending = false
        if status ~= 200 and status ~= 204 then
          for _, p in ipairs(batch) do
            if pending[p.discord] == nil then pending[p.discord] = p end
          end
        end
      end, 'POST', json.encode({ players = batch }), headers())
    end
  end
end)

CreateThread(function()
  while true do
    local players = {}
    for _, sid in ipairs(GetPlayers()) do
      local p = snapshot(tonumber(sid), true)
      if p then players[#players + 1] = p end
    end
    PerformHttpRequest(Config.SyncUrl, function() end, 'POST',
      json.encode({ jobs = jobsCatalog(), players = players, full = true }), headers())
    Wait(Config.ReconcileInterval)
  end
end)
