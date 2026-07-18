import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Mock socket module
const mockEmit = vi.fn(() => true);
const mockOn = vi.fn(() => vi.fn()); // return unsub
const mockIsConnected = vi.fn(() => false);
const mockConnectSocket = vi.fn();
const mockDisconnectSocket = vi.fn();
const mockSetUsername = vi.fn();

vi.mock('../lib/socket', () => ({
  connectSocket: (...args: any[]) => mockConnectSocket(...args),
  disconnectSocket: (...args: any[]) => mockDisconnectSocket(...args),
  emit: (...args: any[]) => mockEmit(...args),
  on: (...args: any[]) => mockOn(...args),
  isConnected: () => mockIsConnected(),
  setUsername: (...args: any[]) => mockSetUsername(...args),
}));

import Home from '../app/page';

describe('Home Component - Trang đăng nhập', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConnected.mockReturnValue(false);
  });

  it('hiển thị form đăng nhập khi chưa đăng nhập', () => {
    render(<Home />);
    expect(screen.getByText('MiniChat')).toBeInTheDocument();
    expect(screen.getByText('Nhập tên người dùng để tham gia trò chuyện')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Tên người dùng')).toBeInTheDocument();
    expect(screen.getByText('Tham gia')).toBeInTheDocument();
  });

  it('cho phép nhập tên người dùng', () => {
    render(<Home />);
    const input = screen.getByPlaceholderText('Tên người dùng');
    fireEvent.change(input, { target: { value: 'alice' } });
    expect(input).toHaveValue('alice');
  });

  it('không submit khi username trống', () => {
    render(<Home />);
    const form = screen.getByText('Tham gia').closest('form')!;
    fireEvent.submit(form);
    expect(mockConnectSocket).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('gọi connectSocket khi submit với username hợp lệ', () => {
    render(<Home />);
    const input = screen.getByPlaceholderText('Tên người dùng');
    fireEvent.change(input, { target: { value: 'alice' } });

    const form = screen.getByText('Tham gia').closest('form')!;
    fireEvent.submit(form);

    expect(mockSetUsername).toHaveBeenCalledWith('alice');
    expect(mockConnectSocket).toHaveBeenCalled();
  });

  it('gọi emit register khi đã connected', () => {
    mockIsConnected.mockReturnValue(true);
    render(<Home />);
    const input = screen.getByPlaceholderText('Tên người dùng');
    fireEvent.change(input, { target: { value: 'bob' } });

    const form = screen.getByText('Tham gia').closest('form')!;
    fireEvent.submit(form);

    expect(mockEmit).toHaveBeenCalledWith('register', { username: 'bob' });
  });

  it('hiển thị lỗi đăng nhập khi có loginError', async () => {
    // Giả lập register-response thất bại
    mockOn.mockImplementation((event: string, handler: any) => {
      if (event === 'register-response') {
        setTimeout(() => handler({ success: false, message: 'Username đã tồn tại' }), 0);
      }
      return vi.fn();
    });

    render(<Home />);
    const input = screen.getByPlaceholderText('Tên người dùng');
    fireEvent.change(input, { target: { value: 'taken' } });
    fireEvent.submit(screen.getByText('Tham gia').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Username đã tồn tại')).toBeInTheDocument();
    });
  });
});

describe('Home Component - Giao diện chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConnected.mockReturnValue(true);

    // Mô phỏng đăng nhập thành công
    mockOn.mockImplementation((event: string, handler: any) => {
      if (event === 'register-response') {
        setTimeout(() => handler({
          success: true,
          username: 'alice',
          users: ['bob', 'charlie'],
          groups: ['general', 'random'],
          myGroups: ['general'],
          groupMembers: { general: ['alice', 'bob'] },
        }), 0);
      }
      return vi.fn();
    });
  });

  async function loginAs(username = 'alice') {
    render(<Home />);
    const input = screen.getByPlaceholderText('Tên người dùng');
    fireEvent.change(input, { target: { value: username } });
    fireEvent.submit(screen.getByText('Tham gia').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Phát chung')).toBeInTheDocument();
    });
  }

  it('hiển thị giao diện chat sau khi đăng nhập', async () => {
    await loginAs();

    // Sidebar trái
    expect(screen.getByText('MiniChat')).toBeInTheDocument();
    expect(screen.getByText('Kênh')).toBeInTheDocument();
    expect(screen.getByText('Phát chung')).toBeInTheDocument();
    expect(screen.getByText('Nhóm của tôi')).toBeInTheDocument();
  });

  it('hiển thị danh sách người dùng trực tuyến', async () => {
    await loginAs();

    await waitFor(() => {
      expect(screen.getByText('bob')).toBeInTheDocument();
      expect(screen.getByText('charlie')).toBeInTheDocument();
    });
  });

  it('hiển thị nhóm đã tham gia', async () => {
    await loginAs();

    await waitFor(() => {
      const elements = screen.getAllByText('general');
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('hiển thị màn hình chào mừng khi chưa có tin nhắn', async () => {
    await loginAs();

    expect(screen.getByText('Chào mừng, alice!')).toBeInTheDocument();
    expect(screen.getByText('Bắt đầu cuộc trò chuyện bằng cách gửi tin nhắn')).toBeInTheDocument();
  });

  it('hiển thị nút thao tác', async () => {
    await loginAs();

    expect(screen.getByText('+ Tạo nhóm')).toBeInTheDocument();
    expect(screen.getByText('Đăng xuất')).toBeInTheDocument();
  });

  it('hiển thị input gửi tin nhắn', async () => {
    await loginAs();

    expect(screen.getByPlaceholderText('Nhắn tin tới Broadcast...')).toBeInTheDocument();
    expect(screen.getByText('Gửi')).toBeInTheDocument();
  });
});

describe('Home Component - Gửi tin nhắn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConnected.mockReturnValue(true);
    mockEmit.mockReturnValue(true);

    mockOn.mockImplementation((event: string, handler: any) => {
      if (event === 'register-response') {
        setTimeout(() => handler({
          success: true,
          username: 'alice',
          users: ['bob'],
          groups: [],
          myGroups: [],
          groupMembers: {},
        }), 0);
      }
      return vi.fn();
    });
  });

  async function loginAndGetReady() {
    render(<Home />);
    const input = screen.getByPlaceholderText('Tên người dùng');
    fireEvent.change(input, { target: { value: 'alice' } });
    fireEvent.submit(screen.getByText('Tham gia').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Phát chung')).toBeInTheDocument();
    });
  }

  it('gửi broadcast message', async () => {
    await loginAndGetReady();

    const msgInput = screen.getByPlaceholderText('Nhắn tin tới Broadcast...');
    fireEvent.change(msgInput, { target: { value: 'Xin chào mọi người!' } });
    fireEvent.submit(msgInput.closest('form')!);

    expect(mockEmit).toHaveBeenCalledWith('broadcast-message', { message: 'Xin chào mọi người!' });
  });

  it('xóa input sau khi gửi tin nhắn thành công', async () => {
    await loginAndGetReady();

    const msgInput = screen.getByPlaceholderText('Nhắn tin tới Broadcast...');
    fireEvent.change(msgInput, { target: { value: 'Test message' } });
    fireEvent.submit(msgInput.closest('form')!);

    expect(msgInput).toHaveValue('');
  });

  it('không gửi tin nhắn trống', async () => {
    await loginAndGetReady();

    const msgInput = screen.getByPlaceholderText('Nhắn tin tới Broadcast...');
    fireEvent.submit(msgInput.closest('form')!);

    // emit không được gọi cho broadcast-message (có thể gọi cho register)
    expect(mockEmit).not.toHaveBeenCalledWith('broadcast-message', expect.anything());
  });

  it('không gửi khi socket chưa kết nối', async () => {
    await loginAndGetReady();
    mockIsConnected.mockReturnValue(false);

    const msgInput = screen.getByPlaceholderText('Nhắn tin tới Broadcast...');
    fireEvent.change(msgInput, { target: { value: 'Hello' } });
    fireEvent.submit(msgInput.closest('form')!);

    expect(mockEmit).not.toHaveBeenCalledWith('broadcast-message', expect.anything());
  });

  it('hiển thị tin nhắn đã gửi trong khung chat', async () => {
    await loginAndGetReady();

    const msgInput = screen.getByPlaceholderText('Nhắn tin tới Broadcast...');
    fireEvent.change(msgInput, { target: { value: 'Hello broadcast!' } });
    fireEvent.submit(msgInput.closest('form')!);

    expect(screen.getByText('Hello broadcast!')).toBeInTheDocument();
  });
});

describe('Home Component - Chuyển kênh chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConnected.mockReturnValue(true);
    mockEmit.mockReturnValue(true);

    mockOn.mockImplementation((event: string, handler: any) => {
      if (event === 'register-response') {
        setTimeout(() => handler({
          success: true,
          username: 'alice',
          users: ['bob'],
          groups: ['team'],
          myGroups: ['team'],
          groupMembers: { team: ['alice', 'bob'] },
        }), 0);
      }
      return vi.fn();
    });
  });

  async function loginAndGetReady() {
    render(<Home />);
    const input = screen.getByPlaceholderText('Tên người dùng');
    fireEvent.change(input, { target: { value: 'alice' } });
    fireEvent.submit(screen.getByText('Tham gia').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('bob')).toBeInTheDocument();
    });
  }

  it('chuyển sang private chat khi click user', async () => {
    await loginAndGetReady();

    fireEvent.click(screen.getByText('bob'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Nhắn tin tới bob...')).toBeInTheDocument();
    });
  });

  it('gửi private message khi ở user chat', async () => {
    await loginAndGetReady();

    // Click user bob để chuyển sang private chat
    fireEvent.click(screen.getByText('bob'));

    // Đợi placeholder thay đổi
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Nhắn tin tới bob...')).toBeInTheDocument();
    });

    const msgInput = screen.getByPlaceholderText('Nhắn tin tới bob...');
    fireEvent.change(msgInput, { target: { value: 'Hi Bob!' } });
    fireEvent.submit(msgInput.closest('form')!);

    expect(mockEmit).toHaveBeenCalledWith('private-message', { target: 'bob', message: 'Hi Bob!' });
  });

  it('chuyển sang group chat khi click nhóm', async () => {
    await loginAndGetReady();

    // Nhóm "team" xuất hiện ở cả sidebar trái (Nhóm của tôi) và sidebar phải (Rời nhóm)
    const teamElements = screen.getAllByText('team');
    fireEvent.click(teamElements[0]);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Nhắn tin tới team...')).toBeInTheDocument();
    });
  });

  it('gửi group message khi ở group chat', async () => {
    await loginAndGetReady();

    const teamElements = screen.getAllByText('team');
    fireEvent.click(teamElements[0]);

    await waitFor(() => {
      const msgInput = screen.getByPlaceholderText('Nhắn tin tới team...');
      fireEvent.change(msgInput, { target: { value: 'Hi team!' } });
      fireEvent.submit(msgInput.closest('form')!);
    });

    expect(mockEmit).toHaveBeenCalledWith('group-message', { group: 'team', message: 'Hi team!' });
  });
});

describe('Home Component - Quản lý nhóm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConnected.mockReturnValue(true);
    mockEmit.mockReturnValue(true);

    mockOn.mockImplementation((event: string, handler: any) => {
      if (event === 'register-response') {
        setTimeout(() => handler({
          success: true,
          username: 'alice',
          users: ['bob'],
          groups: ['public-group', 'my-group'],
          myGroups: ['my-group'],
          groupMembers: { 'my-group': ['alice'] },
        }), 0);
      }
      return vi.fn();
    });
  });

  async function loginAndGetReady() {
    render(<Home />);
    const input = screen.getByPlaceholderText('Tên người dùng');
    fireEvent.change(input, { target: { value: 'alice' } });
    fireEvent.submit(screen.getByText('Tham gia').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('+ Tạo nhóm')).toBeInTheDocument();
    });
  }

  it('mở modal tạo nhóm khi click nút', async () => {
    await loginAndGetReady();

    fireEvent.click(screen.getByText('+ Tạo nhóm'));

    expect(screen.getByText('Tạo nhóm mới')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Tên nhóm')).toBeInTheDocument();
  });

  it('tạo nhóm khi nhập tên và bấm Tạo', async () => {
    await loginAndGetReady();

    fireEvent.click(screen.getByText('+ Tạo nhóm'));

    const groupInput = screen.getByPlaceholderText('Tên nhóm');
    fireEvent.change(groupInput, { target: { value: 'new-team' } });
    fireEvent.click(screen.getByText('Tạo'));

    expect(mockEmit).toHaveBeenCalledWith('create-group', { name: 'new-team' });
  });

  it('đóng modal khi bấm Hủy', async () => {
    await loginAndGetReady();

    fireEvent.click(screen.getByText('+ Tạo nhóm'));
    expect(screen.getByText('Tạo nhóm mới')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Hủy'));

    await waitFor(() => {
      expect(screen.queryByText('Tạo nhóm mới')).not.toBeInTheDocument();
    });
  });

  it('không tạo nhóm khi tên trống', async () => {
    await loginAndGetReady();

    fireEvent.click(screen.getByText('+ Tạo nhóm'));
    fireEvent.click(screen.getByText('Tạo'));

    expect(mockEmit).not.toHaveBeenCalledWith('create-group', expect.anything());
  });

  it('hiển thị nhóm có thể tham gia', async () => {
    await loginAndGetReady();

    await waitFor(() => {
      expect(screen.getByText('Nhóm có thể tham gia')).toBeInTheDocument();
      expect(screen.getByText('public-group')).toBeInTheDocument();
    });
  });

  it('gọi join-group khi click tham gia', async () => {
    await loginAndGetReady();

    await waitFor(() => {
      const joinBtn = screen.getByText('public-group').closest('button')!;
      fireEvent.click(joinBtn);
    });

    expect(mockEmit).toHaveBeenCalledWith('join-group', { name: 'public-group' });
  });

  it('hiển thị nhóm có thể rời', async () => {
    await loginAndGetReady();

    await waitFor(() => {
      expect(screen.getByText('Rời nhóm')).toBeInTheDocument();
    });
  });

  it('gọi leave-group khi click rời', async () => {
    await loginAndGetReady();

    await waitFor(() => {
      const leaveSection = screen.getByText('Rời nhóm').closest('.sidebar-section')!;
      const leaveBtn = leaveSection.querySelector('button')!;
      fireEvent.click(leaveBtn);
    });

    expect(mockEmit).toHaveBeenCalledWith('leave-group', { name: 'my-group' });
  });
});

describe('Home Component - Đăng xuất', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConnected.mockReturnValue(true);
    mockEmit.mockReturnValue(true);

    mockOn.mockImplementation((event: string, handler: any) => {
      if (event === 'register-response') {
        setTimeout(() => handler({
          success: true,
          username: 'alice',
          users: [],
          groups: [],
          myGroups: [],
          groupMembers: {},
        }), 0);
      }
      return vi.fn();
    });
  });

  it('quay lại màn hình đăng nhập khi đăng xuất', async () => {
    render(<Home />);
    const input = screen.getByPlaceholderText('Tên người dùng');
    fireEvent.change(input, { target: { value: 'alice' } });
    fireEvent.submit(screen.getByText('Tham gia').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Đăng xuất')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Đăng xuất'));

    expect(screen.getByText('Nhập tên người dùng để tham gia trò chuyện')).toBeInTheDocument();
    expect(mockDisconnectSocket).toHaveBeenCalled();
  });
});

describe('Home Component - Mobile Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConnected.mockReturnValue(true);
    mockEmit.mockReturnValue(true);

    mockOn.mockImplementation((event: string, handler: any) => {
      if (event === 'register-response') {
        setTimeout(() => handler({
          success: true,
          username: 'alice',
          users: [],
          groups: [],
          myGroups: [],
          groupMembers: {},
        }), 0);
      }
      return vi.fn();
    });
  });

  it('hiển thị nút mobile navigation', async () => {
    render(<Home />);
    fireEvent.change(screen.getByPlaceholderText('Tên người dùng'), { target: { value: 'alice' } });
    fireEvent.submit(screen.getByText('Tham gia').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('☰ Kênh')).toBeInTheDocument();
      expect(screen.getByText('⚙ Thao tác')).toBeInTheDocument();
    });
  });
});
